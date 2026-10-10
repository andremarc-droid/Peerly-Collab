import { XP_AWARDS } from './xp'
import { isDayKey } from './streak'

export type DailyGoalXp = typeof XP_AWARDS.dailyGoals[number]
export interface StatsSummary {
  version: 1
  xp: number
  totalReviews: number
  currentStreak: number
  longestStreak: number
  lastActiveDay: string
  dailyGoalXp: DailyGoalXp
  today: { day: string; xp: number }
  updatedAt: { toMillis(): number }
}

export class StatsValidationError extends Error { constructor(message: string) { super(message); this.name = 'StatsValidationError' } }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const nonNegativeInt = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max
const timestamp = (value: unknown): value is { toMillis(): number } => record(value) && typeof value.toMillis === 'function' && Number.isFinite((value.toMillis as () => number)())

export function emptyStats(today: string, updatedAt: StatsSummary['updatedAt'] = { toMillis: () => Date.now() }): StatsSummary {
  return { version: 1, xp: 0, totalReviews: 0, currentStreak: 0, longestStreak: 0, lastActiveDay: today, dailyGoalXp: XP_AWARDS.dailyGoalDefault, today: { day: today, xp: 0 }, updatedAt }
}

/** Stored stats are untrusted; malformed or future-dated values fall back to a zero state. */
export function parseStats(value: unknown, today: string): StatsSummary {
  const fallback = () => emptyStats(today)
  try {
    if (!isDayKey(today) || !record(value) || !exactKeys(value, ['version', 'xp', 'totalReviews', 'currentStreak', 'longestStreak', 'lastActiveDay', 'dailyGoalXp', 'today', 'updatedAt'])) return fallback()
    if (value.version !== 1 || !nonNegativeInt(value.xp) || !nonNegativeInt(value.totalReviews)
      || !nonNegativeInt(value.currentStreak, 1_000_000) || !nonNegativeInt(value.longestStreak, 1_000_000)
      || value.longestStreak < value.currentStreak || !isDayKey(value.lastActiveDay) || value.lastActiveDay > today
      || !XP_AWARDS.dailyGoals.includes(value.dailyGoalXp as DailyGoalXp) || !record(value.today)
      || !exactKeys(value.today, ['day', 'xp']) || !isDayKey(value.today.day) || !nonNegativeInt(value.today.xp, XP_AWARDS.maxPerDay)
      || !timestamp(value.updatedAt)) return fallback()
    const todayXp = value.today.day === today ? value.today.xp : 0
    return { version: 1, xp: value.xp, totalReviews: value.totalReviews, currentStreak: value.currentStreak, longestStreak: value.longestStreak, lastActiveDay: value.lastActiveDay, dailyGoalXp: value.dailyGoalXp as DailyGoalXp, today: { day: today, xp: todayXp }, updatedAt: value.updatedAt }
  } catch { return fallback() }
}
