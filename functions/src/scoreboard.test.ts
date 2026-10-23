import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFirestore } from 'firebase-admin/firestore'
import {
  DAILY_CAPS,
  POINT_VALUES,
  TOTAL_DAILY_CAP,
  recordStudyEventHandler,
  updateScoreboardOptInHandler,
} from './scoreboard'

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
      increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
  }
})

describe('scoreboard Cloud Functions', () => {
  const mockedGetFirestore = vi.mocked(getFirestore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has consistent point values and daily caps', () => {
    expect(POINT_VALUES.card_mastered).toBe(5)
    expect(POINT_VALUES.practice_completed).toBe(25)
    expect(POINT_VALUES.quiz_completed).toBe(50)
    expect(DAILY_CAPS.card_mastered).toBe(100)
    expect(DAILY_CAPS.practice_completed).toBe(50)
    expect(DAILY_CAPS.quiz_completed).toBe(100)
    expect(TOTAL_DAILY_CAP).toBe(250)
  })

  describe('recordStudyEventHandler', () => {
    it('throws when unauthenticated', async () => {
      await expect(
        recordStudyEventHandler({ auth: null, data: { eventType: 'card_mastered' } } as any),
      ).rejects.toThrow('You must be signed in to record study points.')
    })

    it('awards points within daily caps for an opted-in adult user', async () => {
      const mockLogSnap = {
        data: () => ({ total: 0, card_mastered: 0 }),
      }
      const mockUserSnap = {
        data: () => ({ role: 'student', age: 20, scoreboardOptIn: true, displayName: 'Adult Student' }),
      }

      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('users/')) return mockUserSnap
          return mockLogSnap
        }),
        set: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await recordStudyEventHandler({
        auth: { uid: 'adult-1', token: {} },
        data: { eventType: 'card_mastered', count: 4 },
      } as any)

      expect(res).toEqual({ awardedPoints: 20, totalDailyPoints: 20 })
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/weekly/entries/adult-1' },
        expect.objectContaining({ points: 'INCREMENT_20', optIn: true }),
        { merge: true },
      )
    })

    it('excludes users under 18 from scoreboard when scoreboardOptIn is undefined or false', async () => {
      const mockLogSnap = {
        data: () => ({ total: 0, card_mastered: 0 }),
      }
      const mockUserSnap = {
        data: () => ({ role: 'student', age: 15, displayName: 'Young Student' }),
      }

      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('users/')) return mockUserSnap
          return mockLogSnap
        }),
        set: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await recordStudyEventHandler({
        auth: { uid: 'minor-1', token: {} },
        data: { eventType: 'card_mastered', count: 2 },
      } as any)

      expect(res.awardedPoints).toBe(10)
      // Only daily log should be set, not public scoreboard entries!
      const calls = transaction.set.mock.calls
      const scoreboardCalls = calls.filter((c: any[]) => c[0].path?.includes('scoreboard/'))
      expect(scoreboardCalls).toHaveLength(0)
    })
  })

  describe('updateScoreboardOptInHandler', () => {
    it('deletes public scoreboard entries when optIn is set to false', async () => {
      const mockUserSnap = {
        data: () => ({ displayName: 'Learner' }),
      }

      const transaction = {
        get: vi.fn().mockResolvedValue(mockUserSnap),
        set: vi.fn(),
        delete: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await updateScoreboardOptInHandler({
        auth: { uid: 'user-1', token: {} },
        data: { optIn: false },
      } as any)

      expect(res).toEqual({ success: true, optIn: false })
      expect(transaction.delete).toHaveBeenCalledWith({ path: 'scoreboard/weekly/entries/user-1' })
      expect(transaction.delete).toHaveBeenCalledWith({ path: 'scoreboard/allTime/entries/user-1' })
    })
  })
})
