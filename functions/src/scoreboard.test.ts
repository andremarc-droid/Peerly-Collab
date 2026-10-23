import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFirestore } from 'firebase-admin/firestore'
import {
  calculateCappedDelta,
  DAILY_SCOREBOARD_CAP,
  resolveAvatar,
  resolveDisplayName,
  resolveScoreboardOptIn,
  validateScoreboardDisplayName,
} from './scoreboardLogic.js'
import {
  resolveScoreboardOptIn as clientResolveScoreboardOptIn,
  resolveDisplayName as clientResolveDisplayName,
  resolveAvatar as clientResolveAvatar,
  validateScoreboardDisplayName as clientValidateScoreboardDisplayName,
} from '../../src/features/scoreboard/schemas.js'
import {
  ensureScoreboardEntryHandler,
  resetWeeklyScoreboardHandler,
  syncStatsSummaryToScoreboardHandler,
  syncUserToScoreboardHandler,
  updateScoreboardOptInHandler,
} from './scoreboard.js'

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
      increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
  }
})

describe('scoreboard pure logic & parity', () => {
  it('has complete parity between functions and client opt-in resolution', () => {
    const testCases = [
      { role: 'student', age: 17, scoreboardOptIn: undefined, expected: false },
      { role: 'student', age: 18, scoreboardOptIn: undefined, expected: true },
      { role: 'student', age: null, scoreboardOptIn: undefined, expected: true },
      { role: 'instructor', age: 16, scoreboardOptIn: undefined, expected: true },
      { role: 'student', age: 16, scoreboardOptIn: true, expected: true },
      { role: 'student', age: 25, scoreboardOptIn: false, expected: false },
      { role: 'instructor', age: 40, scoreboardOptIn: false, expected: false },
      { role: undefined, age: undefined, scoreboardOptIn: undefined, expected: true },
    ]

    for (const tc of testCases) {
      const serverResult = resolveScoreboardOptIn(tc)
      const clientResult = clientResolveScoreboardOptIn(tc)
      expect(serverResult).toBe(tc.expected)
      expect(clientResult).toBe(tc.expected)
    }
  })

  it('resolves display name and avatar with matching fallbacks', () => {
    const u1 = { scoreboardDisplayName: 'CustomName', displayName: 'Regular', name: 'Raw' }
    expect(resolveDisplayName(u1)).toBe('CustomName')
    expect(clientResolveDisplayName(u1)).toBe('CustomName')

    const u2 = { scoreboardDisplayName: '', displayName: 'Regular', name: 'Raw' }
    expect(resolveDisplayName(u2)).toBe('Regular')
    expect(clientResolveDisplayName(u2)).toBe('Regular')

    const u3 = { scoreboardDisplayName: null, displayName: null, name: 'Raw' }
    expect(resolveDisplayName(u3)).toBe('Raw')
    expect(clientResolveDisplayName(u3)).toBe('Raw')

    const u4 = {}
    expect(resolveDisplayName(u4)).toBe('Peerly Learner')
    expect(clientResolveDisplayName(u4)).toBe('Peerly Learner')

    const a1 = { avatar: 'https://img.com/a.png', photoURL: 'https://img.com/b.png' }
    expect(resolveAvatar(a1)).toBe('https://img.com/a.png')
    expect(clientResolveAvatar(a1)).toBe('https://img.com/a.png')

    const a2 = { photoURL: 'https://img.com/b.png' }
    expect(resolveAvatar(a2)).toBe('https://img.com/b.png')
    expect(clientResolveAvatar(a2)).toBe('https://img.com/b.png')
  })

  it('correctly calculates capped delta within daily cap', () => {
    expect(calculateCappedDelta(0, 25, DAILY_SCOREBOARD_CAP)).toBe(25)
    expect(calculateCappedDelta(490, 25, DAILY_SCOREBOARD_CAP)).toBe(10)
    expect(calculateCappedDelta(500, 25, DAILY_SCOREBOARD_CAP)).toBe(0)
    expect(calculateCappedDelta(0, -5, DAILY_SCOREBOARD_CAP)).toBe(0)
  })

  it('has complete parity between functions and client display name validation', () => {
    const testCases = [
      '',
      'a',
      'ab',
      'ValidName',
      'This name is way too long to be allowed on the scoreboard because it exceeds thirty chars',
      'admin',
      'ADMIN',
      'Peerly',
      'system',
      'root',
      'some badword bitch',
      'Regular Learner',
    ]

    for (const name of testCases) {
      const serverResult = validateScoreboardDisplayName(name)
      const clientResult = clientValidateScoreboardDisplayName(name)
      expect(serverResult.valid).toBe(clientResult.valid)
      expect(serverResult.error).toBe(clientResult.error)
    }
  })
})

describe('scoreboard Cloud Functions handlers', () => {
  const mockedGetFirestore = vi.mocked(getFirestore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('syncStatsSummaryToScoreboardHandler', () => {
    it('ignores non-positive delta or deleted documents', async () => {
      const res = await syncStatsSummaryToScoreboardHandler({
        params: { uid: 'u1' },
        data: {
          before: { exists: true, data: () => ({ xp: 100 }) } as any,
          after: { exists: true, data: () => ({ xp: 100 }) } as any,
        },
      } as any)
      expect(res).toEqual({ awardedPoints: 0, totalDailyPoints: 0 })
    })

    it('awards delta when user is opted in and caps at DAILY_SCOREBOARD_CAP', async () => {
      const mockUserSnap = {
        data: () => ({ role: 'student', age: 20, displayName: 'Adult Student' }),
      }
      const mockLogSnap = {
        exists: true,
        data: () => ({ total: 480 }),
      }
      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('users/')) return mockUserSnap
          if (ref.path.includes('userPointDailyLogs/')) return mockLogSnap
          return { exists: false }
        }),
        set: vi.fn(),
      }
      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await syncStatsSummaryToScoreboardHandler({
        params: { uid: 'u1' },
        data: {
          before: { exists: true, data: () => ({ xp: 100 }) } as any,
          after: { exists: true, data: () => ({ xp: 130 }) } as any, // delta = 30
        },
      } as any)

      // Total was 480, cap is 500, so only 20 can be awarded out of delta 30
      expect(res?.awardedPoints).toBe(20)
      expect(res?.totalDailyPoints).toBe(500)
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/weekly/entries/u1' },
        expect.objectContaining({ points: 'INCREMENT_20', optIn: true }),
        { merge: true },
      )
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/allTime/entries/u1' },
        expect.objectContaining({ points: 'INCREMENT_20', optIn: true }),
        { merge: true },
      )
    })

    it('awards nothing if user is minor without explicit opt-in', async () => {
      const mockUserSnap = {
        data: () => ({ role: 'student', age: 15, displayName: 'Minor' }),
      }
      const transaction = {
        get: vi.fn().mockResolvedValue(mockUserSnap),
        set: vi.fn(),
      }
      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await syncStatsSummaryToScoreboardHandler({
        params: { uid: 'u-minor' },
        data: {
          before: { exists: true, data: () => ({ xp: 0 }) } as any,
          after: { exists: true, data: () => ({ xp: 20 }) } as any,
        },
      } as any)

      expect(res?.awardedPoints).toBe(0)
      expect(transaction.set).not.toHaveBeenCalled()
    })
  })

  describe('ensureScoreboardEntryHandler', () => {
    it('creates missing entries starting allTime at caller current stats xp and weekly at 0', async () => {
      const mockUserSnap = {
        data: () => ({ displayName: 'Learner', role: 'student', age: 20 }),
      }
      const batch = {
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }
      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({
          path,
          get: vi.fn().mockImplementation(async () => {
            if (path.includes('users/u1/stats')) return { exists: true, data: () => ({ xp: 150 }) }
            if (path === 'users/u1') return mockUserSnap
            return { exists: false }
          }),
        })),
        batch: vi.fn(() => batch),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await ensureScoreboardEntryHandler({
        auth: { uid: 'u1', token: {} },
      } as any)

      expect(res).toEqual({ optIn: true, created: true })
      expect(batch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'scoreboard/weekly/entries/u1' }),
        expect.objectContaining({ points: 0, optIn: true, displayName: 'Learner' }),
      )
      expect(batch.set).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'scoreboard/allTime/entries/u1' }),
        expect.objectContaining({ points: 150, optIn: true, displayName: 'Learner' }),
      )
    })

    it('never overwrites existing points when entries exist', async () => {
      const mockUserSnap = {
        data: () => ({ displayName: 'Learner', role: 'student', age: 20 }),
      }
      const batch = {
        set: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }
      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({
          path,
          get: vi.fn().mockImplementation(async () => {
            if (path === 'users/u1') return mockUserSnap
            if (path.includes('users/u1/stats')) return { exists: true, data: () => ({ xp: 150 }) }
            return { exists: true, data: () => ({ points: 50 }) }
          }),
        })),
        batch: vi.fn(() => batch),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await ensureScoreboardEntryHandler({
        auth: { uid: 'u1', token: {} },
      } as any)

      expect(res).toEqual({ optIn: true, created: false })
      // Notice: points field should NOT be in the update payload when docs exist
      for (const call of batch.set.mock.calls) {
        expect(call[1].points).toBeUndefined()
        expect(call[2]).toEqual({ merge: true })
      }
    })
  })

  describe('syncUserToScoreboardHandler', () => {
    it('skips execution if no relevant fields changed', async () => {
      const mockDb = {
        doc: vi.fn(),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      await syncUserToScoreboardHandler({
        params: { userId: 'u1' },
        data: {
          before: { exists: true, data: () => ({ role: 'student', age: 20, updatedAt: 1 }) } as any,
          after: { exists: true, data: () => ({ role: 'student', age: 20, updatedAt: 2 }) } as any,
        },
      } as any)

      expect(mockDb.doc).not.toHaveBeenCalled()
    })

    it('deletes entries when user opts out', async () => {
      const deleteWeekly = vi.fn().mockResolvedValue(undefined)
      const deleteAllTime = vi.fn().mockResolvedValue(undefined)
      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => {
          if (path.includes('weekly')) return { delete: deleteWeekly }
          if (path.includes('allTime')) return { delete: deleteAllTime }
          return {}
        }),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      await syncUserToScoreboardHandler({
        params: { userId: 'u1' },
        data: {
          before: { exists: true, data: () => ({ scoreboardOptIn: true }) } as any,
          after: { exists: true, data: () => ({ scoreboardOptIn: false }) } as any,
        },
      } as any)

      expect(deleteWeekly).toHaveBeenCalled()
      expect(deleteAllTime).toHaveBeenCalled()
    })
  })

  describe('updateScoreboardOptInHandler', () => {
    it('rejects unauthenticated requests', async () => {
      await expect(
        updateScoreboardOptInHandler({ auth: undefined, data: { optIn: true } } as any),
      ).rejects.toMatchObject({ code: 'unauthenticated' })
    })

    it('rejects non-object or non-boolean optIn', async () => {
      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: null } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })

      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: { optIn: 'yes' } } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })
    })

    it('rejects invalid display names with invalid-argument', async () => {
      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: { optIn: true, displayName: 123 } } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })

      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: { optIn: true, displayName: 'a' } } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })

      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: { optIn: true, displayName: 'admin' } } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })

      await expect(
        updateScoreboardOptInHandler({ auth: { uid: 'u1' }, data: { optIn: true, displayName: 'some bitch' } } as any),
      ).rejects.toMatchObject({ code: 'invalid-argument' })
    })

    it('executes all reads before writes when optIn is true without throwing', async () => {
      let hasWritten = false
      const transaction = {
        get: vi.fn().mockImplementation(async () => {
          if (hasWritten) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.')
          }
          return {
            exists: true,
            data: () => ({ displayName: 'Learner', xp: 50 }),
          }
        }),
        set: vi.fn().mockImplementation(() => {
          hasWritten = true
        }),
        delete: vi.fn().mockImplementation(() => {
          hasWritten = true
        }),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await updateScoreboardOptInHandler({
        auth: { uid: 'user-1', token: {} },
        data: { optIn: true, displayName: 'ValidLearner' },
      } as any)

      expect(res).toEqual({ success: true, optIn: true })
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'users/user-1' },
        expect.objectContaining({ scoreboardOptIn: true, scoreboardDisplayName: 'ValidLearner' }),
        { merge: true },
      )
    })

    it('creates weekly at 0 and allTime from stats xp when entries do not exist', async () => {
      const transaction = {
        get: vi.fn().mockImplementation(async (ref: { path: string }) => {
          if (ref.path === 'users/user-1') return { exists: true, data: () => ({ displayName: 'Alice' }) }
          if (ref.path === 'scoreboard/weekly/entries/user-1') return { exists: false }
          if (ref.path === 'scoreboard/allTime/entries/user-1') return { exists: false }
          if (ref.path === 'users/user-1/stats/summary') return { exists: true, data: () => ({ xp: 125 }) }
          return { exists: false }
        }),
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
        data: { optIn: true },
      } as any)

      expect(res).toEqual({ success: true, optIn: true })
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/weekly/entries/user-1' },
        expect.objectContaining({ points: 0, optIn: true, displayName: 'Alice' }),
        { merge: true },
      )
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/allTime/entries/user-1' },
        expect.objectContaining({ points: 125, optIn: true, displayName: 'Alice' }),
        { merge: true },
      )
    })

    it('preserves existing weekly and allTime points when opting in or updating display name', async () => {
      const transaction = {
        get: vi.fn().mockImplementation(async (ref: { path: string }) => {
          if (ref.path === 'users/user-1') return { exists: true, data: () => ({ displayName: 'Alice' }) }
          if (ref.path === 'scoreboard/weekly/entries/user-1') return { exists: true, data: () => ({ points: 42 }) }
          if (ref.path === 'scoreboard/allTime/entries/user-1') return { exists: true, data: () => ({ points: 280 }) }
          if (ref.path === 'users/user-1/stats/summary') return { exists: true, data: () => ({ xp: 300 }) }
          return { exists: false }
        }),
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
        data: { optIn: true },
      } as any)

      expect(res).toEqual({ success: true, optIn: true })
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/weekly/entries/user-1' },
        expect.objectContaining({ points: 42 }),
        { merge: true },
      )
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'scoreboard/allTime/entries/user-1' },
        expect.objectContaining({ points: 280 }),
        { merge: true },
      )
    })

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

  describe('resetWeeklyScoreboardHandler', () => {
    it('zeroes weekly entries and deletes opted-out users across pagination', async () => {
      const docs = [
        { id: 'opted-in-user', ref: { path: 'scoreboard/weekly/entries/opted-in-user' } },
        { id: 'opted-out-user', ref: { path: 'scoreboard/weekly/entries/opted-out-user' } },
      ]

      const batch = {
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue(undefined),
      }

      const mockDb = {
        collection: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              empty: false,
              size: 2,
              docs,
            }),
          }),
        }),
        doc: vi.fn().mockImplementation((path: string) => ({
          path,
          get: vi.fn().mockImplementation(async () => {
            if (path.includes('opted-in-user')) return { exists: true, data: () => ({ role: 'student', age: 20 }) }
            return { exists: true, data: () => ({ scoreboardOptIn: false }) }
          }),
        })),
        batch: vi.fn(() => batch),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const res = await resetWeeklyScoreboardHandler()

      expect(res.processedCount).toBe(2)
      expect(res.resetCount).toBe(1)
      expect(res.deletedCount).toBe(1)
      expect(batch.update).toHaveBeenCalledWith(
        docs[0]!.ref,
        expect.objectContaining({ points: 0 }),
      )
      expect(batch.delete).toHaveBeenCalledWith(docs[1]!.ref)
    })
  })
})
