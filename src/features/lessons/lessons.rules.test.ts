import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const now = new Date()
const plan = (order: string[] = ['one', 'two', 'three']) => ({ title: 'Biology', topic: 'Cells', level: 'beginner', lessonCount: order.length, order, createdAt: now, updatedAt: now, status: 'ready' })
const lesson = { title: 'Cell parts', objective: 'Name cell parts', content: 'Cells contain structures.', keyPoints: ['Cells are basic units.'], flashcards: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, front: 'Cell?', back: 'Basic unit' })), quiz: Array.from({ length: 3 }, (_, i) => ({ id: `q${i}`, kind: 'written', prompt: 'What is a cell?', answer: 'A basic unit', explanation: '' })), updatedAt: now }
const progress = { version: 1, lessons: { one: { step: 'read', bestScore: 0, completedAt: null } }, lastLessonId: 'one', updatedAt: now }

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => environment.cleanup())
beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('users/student').set({ role: 'student' })
    await context.firestore().doc('users/instructor').set({ role: 'instructor' })
  })
})

describe('lesson plan security rules', () => {
  it('allows an owner to write, read and delete a bounded plan, its lesson and progress', async () => {
    const db = environment.authenticatedContext('student').firestore()
    const ref = doc(db, 'users/student/lessonPlans/plan-a')
    await assertSucceeds(setDoc(ref, plan()))
    await assertSucceeds(getDoc(ref))
    await assertSucceeds(setDoc(doc(ref, 'lessons/one'), lesson))
    await assertSucceeds(getDoc(doc(ref, 'lessons/one')))
    await assertSucceeds(updateDoc(ref, { title: 'Updated', updatedAt: new Date() }))
    await assertSucceeds(setDoc(doc(db, 'users/student/lessonProgress/plan-a'), progress))
    await assertSucceeds(getDoc(doc(db, 'users/student/lessonProgress/plan-a')))
    await assertSucceeds(deleteDoc(doc(ref, 'lessons/one')))
    await assertSucceeds(deleteDoc(doc(db, 'users/student/lessonProgress/plan-a')))
    await assertSucceeds(deleteDoc(ref))
  })

  it('allows an instructor with a fresh profile and no classes to own a personal plan', async () => {
    const db = environment.authenticatedContext('instructor').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/instructor/lessonPlans/plan-a'), plan()))
    await assertSucceeds(setDoc(doc(db, 'users/instructor/lessonPlans/plan-a/lessons/one'), lesson))
    await assertSucceeds(setDoc(doc(db, 'users/instructor/lessonProgress/plan-a'), progress))
  })

  it('denies other users, signed-out clients, unknown fields, and unbounded content/order', async () => {
    const owner = environment.authenticatedContext('student').firestore()
    const stranger = environment.authenticatedContext('stranger').firestore()
    const signedOut = environment.unauthenticatedContext().firestore()
    const path = 'users/student/lessonPlans/plan-a'
    await assertFails(setDoc(doc(stranger, path), plan()))
    await assertFails(getDoc(doc(stranger, path)))
    await assertFails(deleteDoc(doc(stranger, path)))
    await assertFails(setDoc(doc(signedOut, path), plan()))
    await assertFails(setDoc(doc(owner, path), { ...plan(), unexpected: true }))
    await assertFails(setDoc(doc(owner, path), plan(Array.from({ length: 13 }, (_, index) => `l${index}`))))
    await assertFails(setDoc(doc(owner, path), { ...plan(), lessonCount: 13, order: Array.from({ length: 13 }, (_, index) => `l${index}`) }))
    await assertSucceeds(setDoc(doc(owner, path), plan()))
    await assertFails(setDoc(doc(owner, path + '/lessons/one'), { ...lesson, content: 'x'.repeat(2001) }))
    await assertFails(setDoc(doc(owner, 'users/other/lessonPlans/plan-a'), plan()))
    await assertFails(setDoc(doc(owner, 'users/student/lessonProgress/plan-a'), { ...progress, extra: 1 }))
    await assertFails(getDoc(doc(signedOut, path)))
  })
})
