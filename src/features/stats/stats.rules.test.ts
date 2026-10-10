import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let environment: RulesTestEnvironment
const utcDay = (offset = 0) => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}
const summary = (overrides: Record<string, unknown> = {}) => {
  const day = utcDay()
  return { version: 1, xp: 0, totalReviews: 0, currentStreak: 0, longestStreak: 0, lastActiveDay: day, dailyGoalXp: 20, today: { day, xp: 0 }, updatedAt: serverTimestamp(), ...overrides }
}

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => environment.cleanup())
beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => { await context.firestore().doc('users/learner').set({ role: 'student' }) })
})

describe('per-user study stats rules', () => {
  it('allows a bounded owner write and blocks another user and signed-out access', async () => {
    const learner = environment.authenticatedContext('learner').firestore()
    const ref = doc(learner, 'users/learner/stats/summary')
    await assertSucceeds(setDoc(ref, summary({ xp: 25, totalReviews: 1, currentStreak: 1, longestStreak: 1, today: { day: utcDay(), xp: 25 } })))
    await assertFails(setDoc(doc(learner, 'users/other/stats/summary'), summary()))
    await assertFails(setDoc(doc(environment.unauthenticatedContext().firestore(), 'users/learner/stats/summary'), summary()))
  })

  it('rejects oversized or decreasing XP/reviews, streak jumps, bad goals, and extra keys', async () => {
    const db = environment.authenticatedContext('learner').firestore()
    const ref = doc(db, 'users/learner/stats/summary')
    await assertFails(setDoc(ref, summary({ xp: 1_000_000 })))
    await assertFails(setDoc(ref, summary({ unknown: true })))
    await assertFails(setDoc(ref, summary({ dailyGoalXp: 15 })))
    const futureDay = utcDay(365)
    await assertFails(setDoc(ref, summary({ lastActiveDay: futureDay, today: { day: futureDay, xp: 0 } })))
    await assertSucceeds(setDoc(ref, summary({ xp: 20, totalReviews: 3, currentStreak: 1, longestStreak: 1, today: { day: utcDay(), xp: 20 } })))
    await assertFails(updateDoc(ref, { xp: 19, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { xp: 46, today: { day: utcDay(), xp: 46 }, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { totalReviews: 29, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { currentStreak: 99, longestStreak: 99, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { longestStreak: 0, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { extra: true, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { dailyGoalXp: 15, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { 'today.xp': 2001, updatedAt: serverTimestamp() }))
  })

  it('allows a daily goal change and bounded streak rollover/reset', async () => {
    const db = environment.authenticatedContext('learner').firestore()
    const ref = doc(db, 'users/learner/stats/summary')
    await assertSucceeds(setDoc(ref, summary({ currentStreak: 4, longestStreak: 5, lastActiveDay: utcDay(-1), today: { day: utcDay(-1), xp: 12 } })))
    await assertSucceeds(updateDoc(ref, { currentStreak: 5, longestStreak: 5, lastActiveDay: utcDay(), dailyGoalXp: 50, today: { day: utcDay(), xp: 2 }, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(ref, { currentStreak: 6, longestStreak: 6, lastActiveDay: utcDay(), today: { day: utcDay(), xp: 2 }, updatedAt: serverTimestamp() }))
    const secondDb = environment.authenticatedContext('learner2').firestore()
    const secondRef = doc(secondDb, 'users/learner2/stats/summary')
    await assertSucceeds(setDoc(secondRef, summary({ currentStreak: 4, longestStreak: 5, lastActiveDay: utcDay(-1), today: { day: utcDay(-1), xp: 12 } })))
    await assertSucceeds(updateDoc(secondRef, { currentStreak: 1, longestStreak: 5, lastActiveDay: utcDay(), today: { day: utcDay(), xp: 0 }, updatedAt: serverTimestamp() }))

    const staleRef = doc(environment.authenticatedContext('learner3').firestore(), 'users/learner3/stats/summary')
    const staleDay = utcDay(-10)
    await environment.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('users/learner3/stats/summary').set({ ...summary({ xp: 100, totalReviews: 30, currentStreak: 3, longestStreak: 4, lastActiveDay: staleDay, today: { day: staleDay, xp: 10 } }), updatedAt: new Date() })
    })
    await assertSucceeds(updateDoc(staleRef, { dailyGoalXp: 100, updatedAt: serverTimestamp() }))
  })

  it('permits stats deletion only in the same batch as account document deletion', async () => {
    const db = environment.authenticatedContext('learner').firestore()
    const statsRef = doc(db, 'users/learner/stats/summary')
    await setDoc(statsRef, summary())
    await assertFails(deleteDoc(statsRef))
    const batch = writeBatch(db)
    batch.delete(statsRef)
    batch.delete(doc(db, 'users/learner'))
    await assertSucceeds(batch.commit())
  })
})
