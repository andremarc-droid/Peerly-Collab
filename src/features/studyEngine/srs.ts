export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy'

export interface CardState {
  ease: number
  intervalDays: number
  due: number
  reps: number
  lapses: number
  lastGrade: ReviewGrade | null
  lastReviewed: number | null
}

export const START_EASE = 2.5
export const MIN_EASE = 1.3
export const MAX_EASE = 3.2
export const MAX_INTERVAL_DAYS = 365
export const RELEARN_DELAY_MS = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function initialCardState(): CardState {
  return { ease: START_EASE, intervalDays: 0, due: 0, reps: 0, lapses: 0, lastGrade: null, lastReviewed: null }
}

function boundedEase(value: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, value))
}

function roundedInterval(value: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(value)))
}

/** SM-2-lite with four quality buttons. Returns a new state and never mutates the input. */
export function scheduleReview(previous: CardState | null, grade: ReviewGrade, now: number): CardState {
  const current = previous ?? initialCardState()
  const easeDelta = grade === 'again' ? -0.2 : grade === 'hard' ? -0.15 : grade === 'easy' ? 0.15 : 0
  if (grade === 'again') {
    return {
      ease: boundedEase(current.ease + easeDelta), intervalDays: 0, due: now + RELEARN_DELAY_MS,
      reps: 0, lapses: current.lapses + (current.reps > 0 ? 1 : 0), lastGrade: grade, lastReviewed: now,
    }
  }
  const reps = current.reps + 1
  let intervalDays: number
  if (grade === 'hard') intervalDays = current.reps === 0 ? 1 : Math.max(current.intervalDays * 1.2, current.intervalDays + 1)
  else if (grade === 'good') intervalDays = current.reps === 0 ? 1 : current.reps === 1 ? 3 : current.intervalDays * current.ease
  else intervalDays = current.reps === 0 ? 4 : current.reps === 1 ? 7 : current.intervalDays * current.ease * 1.3
  intervalDays = roundedInterval(intervalDays)
  return {
    ease: boundedEase(current.ease + easeDelta), intervalDays, due: now + intervalDays * DAY_MS,
    reps, lapses: current.lapses, lastGrade: grade, lastReviewed: now,
  }
}

export function formatInterval(days: number, grade?: ReviewGrade): string {
  const interval = Math.max(0, Math.round(days))
  const label = interval === 0 ? '10m' : interval === 1 ? '1d' : `${interval}d`
  return grade ? `${grade[0].toUpperCase()}${grade.slice(1)} · ${label}` : label
}

export function previewIntervals(state: CardState | null, now: number): Record<ReviewGrade, string> {
  return (['again', 'hard', 'good', 'easy'] as const).reduce((result, grade) => {
    const next = scheduleReview(state, grade, now)
    result[grade] = formatInterval(next.intervalDays, grade)
    return result
  }, {} as Record<ReviewGrade, string>)
}
