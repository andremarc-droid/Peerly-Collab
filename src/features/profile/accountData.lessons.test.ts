import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, type Firestore } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteAccountData } from './accountData'

let environment: RulesTestEnvironment
beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => environment.cleanup())
beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('users/learner').set({ role: 'student' })
    await db.doc('publicProfiles/learner').set({ displayName: 'Learner' })
    await db.doc('users/learner/lessonPlans/plan-a').set({ title: 'Plan', order: ['one'] })
    await db.doc('users/learner/lessonPlans/plan-a/lessons/one').set({ title: 'Lesson' })
    await db.doc('users/learner/lessonProgress/plan-a').set({ version: 1 })
    await db.doc('users/learner/deckProgress/lesson~plan-a~one').set({ version: 1 })
    await db.doc('users/learner/stats/summary').set({ version: 1, xp: 0 })
  })
})

describe('deleteAccountData lesson cleanup', () => {
  it('removes plan documents, lesson children and progress before deleting the profile', async () => {
    const db = environment.authenticatedContext('learner').firestore()
    await deleteAccountData('learner', 'student', db as unknown as Firestore)
    await environment.withSecurityRulesDisabled(async context => {
      const admin = context.firestore()
      expect((await getDoc(doc(admin, 'users/learner/lessonPlans/plan-a'))).exists()).toBe(false)
      expect((await getDoc(doc(admin, 'users/learner/lessonPlans/plan-a/lessons/one'))).exists()).toBe(false)
      expect((await getDoc(doc(admin, 'users/learner/lessonProgress/plan-a'))).exists()).toBe(false)
      expect((await getDoc(doc(admin, 'users/learner/deckProgress/lesson~plan-a~one'))).exists()).toBe(false)
      expect((await getDoc(doc(admin, 'users/learner/stats/summary'))).exists()).toBe(false)
      expect((await getDoc(doc(admin, 'users/learner'))).exists()).toBe(false)
    })
  })
})
