import { describe, expect, it } from 'vitest'
import { advanceStreak, InvalidStreakDayError, localDayKey, visibleStreak } from './streak'

describe('local-day streaks', () => {
  it('keeps the streak on the same local day and increments on the following day', () => {
    const start = { currentStreak: 4, longestStreak: 7, lastActiveDay: '2026-10-09' }
    expect(advanceStreak(start, '2026-10-09')).toEqual(start)
    expect(advanceStreak(start, '2026-10-10')).toEqual({ currentStreak: 5, longestStreak: 7, lastActiveDay: '2026-10-10' })
  })
  it('resets after a missed calendar day and starts a first activity at one', () => {
    expect(advanceStreak({ currentStreak: 4, longestStreak: 8, lastActiveDay: '2026-10-08' }, '2026-10-10')).toEqual({ currentStreak: 1, longestStreak: 8, lastActiveDay: '2026-10-10' })
    expect(advanceStreak({ currentStreak: 0, longestStreak: 0, lastActiveDay: '2026-10-10' }, '2026-10-10').currentStreak).toBe(1)
    expect(visibleStreak(5, '2026-10-08', '2026-10-10')).toBe(0)
  })
  it('rejects future dates and invalid calendar days', () => {
    expect(() => advanceStreak({ currentStreak: 1, longestStreak: 1, lastActiveDay: '2026-10-11' }, '2026-10-10')).toThrow(InvalidStreakDayError)
    expect(() => advanceStreak({ currentStreak: 1, longestStreak: 1, lastActiveDay: '2026-02-30' }, '2026-03-01')).toThrow(InvalidStreakDayError)
  })
  it('uses local calendar dates around midnight, DST, and timezone changes', () => {
    expect(localDayKey(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10')
    expect(localDayKey(new Date(2026, 9, 11, 0, 1))).toBe('2026-10-11')
    const beforeDst = new Date(2026, 2, 8, 0, 30)
    const afterDst = new Date(2026, 2, 9, 0, 30)
    expect(localDayKey(afterDst)).not.toBe(localDayKey(beforeDst))
    expect(advanceStreak({ currentStreak: 2, longestStreak: 2, lastActiveDay: '2026-03-08' }, '2026-03-09').currentStreak).toBe(3)
    // A timezone change may shift the local date forward one day; it still uses calendar-day semantics.
    expect(advanceStreak({ currentStreak: 2, longestStreak: 2, lastActiveDay: '2026-10-10' }, '2026-10-11').currentStreak).toBe(3)
  })
})
