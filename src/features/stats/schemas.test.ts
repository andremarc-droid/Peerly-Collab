import { describe, expect, it } from 'vitest'
import { emptyStats, parseStats } from './schemas'

const stamp = { toMillis: () => 1 }
const valid = { ...emptyStats('2026-10-10', stamp), xp: 25, totalReviews: 4, currentStreak: 2, longestStreak: 3 }

describe('stats schema', () => {
  it('parses valid data and resets daily XP when the local day changes', () => {
    expect(parseStats(valid, '2026-10-10')).toMatchObject({ xp: 25, today: { day: '2026-10-10', xp: 0 } })
    expect(parseStats({ ...valid, today: { day: '2026-10-09', xp: 18 } }, '2026-10-10').today.xp).toBe(0)
  })
  it.each([
    { ...valid, xp: -1 }, { ...valid, unknown: true }, { ...valid, xp: 1.5 },
    { ...valid, lastActiveDay: '2026-10-11' }, { ...valid, lastActiveDay: '2026-02-30' },
    { ...valid, longestStreak: 1 }, { ...valid, today: { day: '2026-10-10', xp: 2001 } },
  ])('falls back to zero stats for malformed or future data', value => {
    expect(parseStats(value, '2026-10-10')).toMatchObject({ xp: 0, totalReviews: 0, currentStreak: 0, today: { xp: 0 } })
  })
})
