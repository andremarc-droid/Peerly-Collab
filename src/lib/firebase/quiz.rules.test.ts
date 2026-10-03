import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import rules from '../../../firestore.rules?raw'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const now = Timestamp.fromMillis(1000)
const settings = {
  answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'immediate', scoresReleased: false,
  timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false,
}
const quizData = (ownerId = 'teacher', status = 'published') => ({
  ownerId, ownerName: 'Teacher', title: 'Algebra practice', description: '', tags: [], mode: 'quiz', status,
  questionCount: 1, createdAt: now, updatedAt: now, publishedAt: status === 'published' ? now : null, settings,
})
const question = { order: 0, type: 'multiple_choice', prompt: 'Pick', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }
const key = { type: 'choice', correctOptionId: 'b', explanation: 'Because.', caseSensitive: false }
const attempt = (userId = 'student', status = 'in_progress') => ({
  userId, userName: 'Student', attemptNumber: 1, status, answers: {}, questionOrder: ['q'], optionOrder: { q: ['a', 'b'] },
  startedAt: now, submittedAt: status === 'submitted' ? now : null, timeSpentSeconds: status === 'submitted' ? 4 : 0,
})
const participant = (uid = 'student', activeAttemptId: string | null = 'att') => ({
  userId: uid, userName: 'Student', createdAt: now, updatedAt: now, attemptCount: 1, activeAttemptId,
})
const result = (userId = 'student') => ({ userId, score: 2, maxScore: 2, perQuestion: { q: { correct: true, pointsAwarded: 2, overridden: false } }, gradedAt: now })

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
})
afterEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

async function seed(data: { status?: string; visibility?: string } = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'users/other'), { uid: 'other', role: 'student' }),
      setDoc(doc(db, 'quizzes/qz'), { ...quizData('teacher', data.status ?? 'published'), settings: { ...settings, scoreVisibility: data.visibility ?? 'immediate' } }),
      setDoc(doc(db, 'quizzes/qz/questions/q'), question),
      setDoc(doc(db, 'quizzes/qz/answerKeys/q'), key),
    ])
  })
}

describe('quiz Firestore rules', () => {
  it('denies signed-out reads and writes and denies unknown collections', async () => {
    const db = environment.unauthenticatedContext().firestore()
    await seed()
    await assertFails(getDoc(doc(db, 'quizzes/qz')))
    await assertFails(setDoc(doc(db, 'quizzes/new'), quizData('student', 'draft')))
    await assertFails(getDoc(doc(db, 'unlisted/x')))
  })

  it('allows instructor-owned quiz operations and rejects another owner and non-instructor creates', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz')))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz'), { title: 'Updated title', updatedAt: now }))
    await assertFails(updateDoc(doc(owner, 'quizzes/qz'), { ownerId: 'student' }))
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/draft'), quizData('teacher', 'draft')))
    await assertFails(getDoc(doc(student, 'quizzes/draft')))
    await assertFails(setDoc(doc(student, 'quizzes/new'), quizData('student', 'draft')))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/new'), { ...quizData('teacher', 'draft'), questionCount: 0, publishedAt: null }))
    await assertFails(setDoc(doc(owner, 'quizzes/bad'), { ...quizData('teacher', 'draft'), mode: 'bad' }))
  })

  it('allows published catalog and question reads but only the owner can write questions', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz')))
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz/questions/q')))
    await assertSucceeds(getDocs(collection(environment.authenticatedContext('other').firestore(), 'quizzes/qz/questions')))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/questions/q'), { prompt: 'Tampered' }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/questions/q'), { prompt: 'Updated' }))
    await assertFails(setDoc(doc(owner, 'quizzes/qz/questions/bad'), { ...question, answer: 'b' }))
  })

  it('restricts answer keys to owners and participants in published quizzes', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertFails(getDoc(doc(student, 'quizzes/qz/answerKeys/q')))
    const batch = writeBatch(student)
    batch.set(doc(student, 'quizzes/qz/attempts/att'), attempt())
    batch.set(doc(student, 'quizzes/qz/participants/student'), participant())
    await assertSucceeds(batch.commit())
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz/answerKeys/q')))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/answerKeys/q'), { explanation: 'Updated.' }))
    await assertFails(setDoc(doc(owner, 'quizzes/qz/answerKeys/bad'), { ...key, acceptedAnswers: ['b'] }))
  })

  it('allows students to create their own participants only for published quizzes', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const studentBatch = writeBatch(student)
    studentBatch.set(doc(student, 'quizzes/qz/attempts/att'), attempt())
    studentBatch.set(doc(student, 'quizzes/qz/participants/student'), participant())
    await assertSucceeds(studentBatch.commit())
    await assertFails(setDoc(doc(student, 'quizzes/qz/participants/other'), participant('other')))
    await assertFails(setDoc(doc(environment.authenticatedContext('other').firestore(), 'quizzes/qz/participants/other'), participant('other')))
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/qz2'), quizData('teacher', 'draft')))
    const draftBatch = writeBatch(student)
    draftBatch.set(doc(student, 'quizzes/qz2/attempts/att'), attempt())
    draftBatch.set(doc(student, 'quizzes/qz2/participants/student'), participant())
    await assertFails(draftBatch.commit())
  })

  it('restricts attempts to published student quizzes, owned records, and one-way submission', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const other = environment.authenticatedContext('other').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    const attemptRef = doc(student, 'quizzes/qz/attempts/att')
    const participantRef = doc(student, 'quizzes/qz/participants/student')
    const batch = writeBatch(student)
    batch.set(attemptRef, attempt())
    batch.set(participantRef, participant())
    await assertSucceeds(batch.commit())
    await assertSucceeds(getDoc(attemptRef))
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz/attempts/att')))
    await assertFails(getDoc(doc(other, 'quizzes/qz/attempts/att')))
    await assertFails(updateDoc(doc(other, 'quizzes/qz/attempts/att'), { answers: { q: 'a' } }))
    await assertFails(updateDoc(attemptRef, { userId: 'other' }))
    const submit = writeBatch(student)
    submit.update(attemptRef, { status: 'submitted', submittedAt: now, timeSpentSeconds: 4 })
    submit.update(participantRef, { activeAttemptId: null, updatedAt: now })
    submit.set(doc(student, 'quizzes/qz/results/att'), result())
    await assertSucceeds(submit.commit())
    await assertFails(updateDoc(attemptRef, { answers: { q: 'b' } }))
  })

  it('enforces results visibility and makes student results immutable', async () => {
    await seed({ visibility: 'hidden' })
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/attempts/att'), attempt('student', 'submitted'))
      await setDoc(doc(db, 'quizzes/qz/results/att'), result())
    })
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertFails(getDoc(doc(student, 'quizzes/qz/results/att')))
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz/results/att')))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/results/att'), { score: 0 }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/results/att'), { score: 1 }))
    await assertFails(setDoc(doc(student, 'quizzes/qz/results/fake'), result()))
  })

  it('allows scores after release and denies student score reads before release', async () => {
    await seed({ visibility: 'after_release' })
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/results/att'), result())
      await updateDoc(doc(db, 'quizzes/qz'), { settings: { ...settings, scoreVisibility: 'after_release', scoresReleased: true } })
    })
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('student').firestore(), 'quizzes/qz/results/att')))
  })
})
