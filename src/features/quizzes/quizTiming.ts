import { Timestamp } from 'firebase/firestore'
import type { QuizSettings } from './types'

/** A limit shorter than this is not a useful quiz timer. */
export const MIN_TIME_LIMIT_SECONDS = 10
export const MAX_TIME_LIMIT_SECONDS = 86_400

type TimingSettings = Pick<QuizSettings, 'timeLimitMinutes'> & Partial<Pick<QuizSettings, 'timeLimitSeconds' | 'opensAt' | 'closesAt'>>

/** The time limit in seconds. Older quizzes only stored minutes, so fall back to that. null means untimed. */
export function effectiveTimeLimitSeconds(settings: TimingSettings): number | null {
  if (settings.timeLimitMinutes === null || settings.timeLimitMinutes === undefined) return null
  if (typeof settings.timeLimitSeconds === 'number') return settings.timeLimitSeconds
  return settings.timeLimitMinutes * 60
}

export function splitSeconds(total: number): { minutes: number; seconds: number } {
  const safe = Math.max(0, Math.floor(total))
  return { minutes: Math.floor(safe / 60), seconds: safe % 60 }
}

/** Both fields that describe the limit, always written together so they cannot disagree. */
export function timeLimitFields(totalSeconds: number | null): Pick<QuizSettings, 'timeLimitMinutes' | 'timeLimitSeconds'> {
  if (totalSeconds === null) return { timeLimitMinutes: null, timeLimitSeconds: null }
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return { timeLimitMinutes: Math.max(1, Math.ceil(seconds / 60)), timeLimitSeconds: seconds }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** "1 minute 30 seconds", "45 seconds", "2 minutes". */
export function formatDuration(totalSeconds: number): string {
  const { minutes, seconds } = splitSeconds(totalSeconds)
  if (minutes === 0) return plural(seconds, 'second')
  if (seconds === 0) return plural(minutes, 'minute')
  return `${plural(minutes, 'minute')} ${plural(seconds, 'second')}`
}

/** A running clock: "4:05", or "1:02:03" once it reaches an hour. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function formatWindowDate(value: Timestamp | Date): string {
  const date = value instanceof Timestamp ? value.toDate() : value
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Value for a "YYYY-MM-DDTHH:mm" local date-time control. Empty when there is no date. */
export function toDateTimeLocal(value: Timestamp | null | undefined): string {
  if (!value) return ''
  const date = value.toDate()
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeLocal(value: string): Timestamp | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date)
}

export type QuizWindowState = 'open' | 'not_open_yet' | 'closed'

/** Whether students may start the quiz right now. A quiz with no dates is always open. */
export function quizWindowState(settings: Pick<QuizSettings, 'opensAt' | 'closesAt'>, nowMs: number): QuizWindowState {
  const opens = settings.opensAt?.toMillis() ?? null
  const closes = settings.closesAt?.toMillis() ?? null
  if (opens !== null && nowMs < opens) return 'not_open_yet'
  if (closes !== null && nowMs > closes) return 'closed'
  return 'open'
}

/** One sentence for students, or null when the quiz has no dates. */
export function describeWindow(settings: Pick<QuizSettings, 'opensAt' | 'closesAt'>): string | null {
  const { opensAt, closesAt } = settings
  if (opensAt && closesAt) return `Available from ${formatWindowDate(opensAt)} until ${formatWindowDate(closesAt)}.`
  if (opensAt) return `Opens ${formatWindowDate(opensAt)}.`
  if (closesAt) return `Deadline: ${formatWindowDate(closesAt)}.`
  return null
}

/** Why the timing settings cannot be saved, or null when they are fine. */
export function timingProblem(settings: TimingSettings): string | null {
  const seconds = effectiveTimeLimitSeconds(settings)
  if (seconds !== null && seconds < MIN_TIME_LIMIT_SECONDS) return `The time limit must be at least ${MIN_TIME_LIMIT_SECONDS} seconds.`
  if (seconds !== null && seconds > MAX_TIME_LIMIT_SECONDS) return 'The time limit cannot be longer than 24 hours.'
  const opens = settings.opensAt?.toMillis()
  const closes = settings.closesAt?.toMillis()
  if (opens !== undefined && closes !== undefined && closes <= opens) return 'The deadline must be after the time the quiz opens.'
  return null
}
