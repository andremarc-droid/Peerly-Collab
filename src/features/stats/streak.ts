export interface StreakState { currentStreak: number; longestStreak: number; lastActiveDay: string }
const DAY_MS = 86_400_000

export class InvalidStreakDayError extends Error {
  constructor(message = 'The activity date is invalid or in the future.') { super(message); this.name = 'InvalidStreakDayError' }
}

export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function dayNumber(day: string): number {
  if (!isDayKey(day)) throw new InvalidStreakDayError()
  return Date.parse(`${day}T00:00:00.000Z`) / DAY_MS
}

export function advanceStreak(current: StreakState, today: string): StreakState {
  const difference = dayNumber(today) - dayNumber(current.lastActiveDay)
  if (difference < 0) throw new InvalidStreakDayError()
  if (difference === 0 && current.currentStreak > 0) return { currentStreak: current.currentStreak, longestStreak: current.longestStreak, lastActiveDay: current.lastActiveDay }
  const currentStreak = difference === 1 && current.currentStreak > 0 ? current.currentStreak + 1 : 1
  return { currentStreak, longestStreak: Math.max(current.longestStreak, currentStreak), lastActiveDay: today }
}

export function visibleStreak(currentStreak: number, lastActiveDay: string, today: string): number {
  const gap = dayNumber(today) - dayNumber(lastActiveDay)
  if (gap < 0) throw new InvalidStreakDayError()
  return gap > 1 ? 0 : currentStreak
}
