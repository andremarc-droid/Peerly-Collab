import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), failNext: false, transactions: 0 }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  getDoc: async (ref: string) => ({ exists: () => fake.docs.has(ref), data: () => fake.docs.get(ref) }),
  onSnapshot: vi.fn(),
  serverTimestamp: () => ({ toMillis: () => Date.now() }),
  runTransaction: async (_db: unknown, callback: (transaction: { get: (ref: string) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> | undefined }>; set: (ref: string, value: Record<string, unknown>) => void; update: (ref: string, value: Record<string, unknown>) => void }) => Promise<unknown>) => {
    fake.transactions += 1
    if (fake.failNext) { fake.failNext = false; throw new Error('offline') }
    const writes: Array<{ ref: string; value: Record<string, unknown>; update: boolean }> = []
    const result = await callback({
      get: async ref => ({ exists: () => fake.docs.has(ref), data: () => fake.docs.get(ref) }),
      set: (ref, value) => writes.push({ ref, value, update: false }),
      update: (ref, value) => writes.push({ ref, value, update: true }),
    })
    for (const write of writes) {
      const previous = fake.docs.get(write.ref) ?? {}
      fake.docs.set(write.ref, write.update ? { ...previous, ...write.value } : write.value)
    }
    return result
  },
}))
vi.mock('../../lib/firebase/firestore', () => ({ firestore: {} }))

import { loadStats, recordActivity, retryPendingActivity } from './services'

beforeEach(() => { fake.docs.clear(); fake.failNext = false; fake.transactions = 0 })

describe('stats services', () => {
  it('records an action once and uses the lesson progress flag as a durable idempotency check', async () => {
    const uid = 'lesson-award-user'
    const progressPath = `users/${uid}/lessonProgress/plan-a`
    fake.docs.set(progressPath, { version: 1, lastLessonId: 'lesson-a', updatedAt: { toMillis: () => Date.now() }, lessons: { 'lesson-a': { step: 'done', bestScore: 3, completedAt: Date.now(), xpAwarded: false } } })
    const action = { kind: 'lessonCompleted' as const, amount: 20, key: 'lesson:plan-a:lesson-a' }
    expect(await recordActivity(uid, action)).toBe(true)
    expect(await recordActivity(uid, action)).toBe(true)
    expect((await loadStats(uid)).xp).toBe(20)
    expect(fake.docs.get(progressPath)?.lessons).toMatchObject({ 'lesson-a': { xpAwarded: true } })

    const secondUid = 'already-awarded-user'
    fake.docs.set(`users/${secondUid}/lessonProgress/plan-a`, { lessons: { 'lesson-a': { step: 'done', xpAwarded: true } } })
    expect(await recordActivity(secondUid, action)).toBe(true)
    expect(fake.docs.has(`users/${secondUid}/stats/summary`)).toBe(false)
  })

  it('splits quiz XP into rule-safe writes and retries failed activity from memory', async () => {
    const uid = 'queued-action-user'
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    fake.failNext = true
    expect(await recordActivity(uid, { kind: 'quizFinished', amount: 55, key: 'quiz:session-1' })).toBe(false)
    expect((await loadStats(uid)).xp).toBe(0)
    await retryPendingActivity(uid)
    expect((await loadStats(uid)).xp).toBe(55)
    expect(fake.transactions).toBeGreaterThanOrEqual(4)
    warning.mockRestore()
  })

  it('counts a zero-XP Again review as activity and increments review count', async () => {
    await recordActivity('again-user', { kind: 'review', amount: 0, key: 'review:again' })
    expect(await loadStats('again-user')).toMatchObject({ xp: 0, totalReviews: 1, currentStreak: 1, today: { xp: 0 } })
  })
})
