import { initialCardState, MAX_INTERVAL_DAYS, MAX_EASE, MIN_EASE, scheduleReview, type CardState, type ReviewGrade } from './srs'

export interface DeckProgress {
  version: 1
  cards: Record<string, CardState>
  newDay: string
  newCount: number
}

export const MAX_PROGRESS_CARDS = 100
const GRADES = new Set<ReviewGrade>(['again', 'hard', 'good', 'easy'])

export class ProgressLimitError extends Error {
  constructor() {
    super('This deck has reached the 100-card progress limit.')
    this.name = 'ProgressLimitError'
  }
}

export function localDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function emptyProgress(day: string): DeckProgress {
  return { version: 1, cards: {}, newDay: day, newCount: 0 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function parseCardState(value: unknown): CardState | null {
  if (!isRecord(value)) return null
  const { ease, intervalDays, due, reps, lapses, lastGrade, lastReviewed } = value
  if (typeof ease !== 'number' || !Number.isFinite(ease) || typeof intervalDays !== 'number' || !Number.isFinite(intervalDays)
    || typeof due !== 'number' || !Number.isFinite(due) || typeof reps !== 'number' || !Number.isFinite(reps)
    || typeof lapses !== 'number' || !Number.isFinite(lapses)
    || !(lastGrade === null || (typeof lastGrade === 'string' && GRADES.has(lastGrade as ReviewGrade)))
    || !(lastReviewed === null || (typeof lastReviewed === 'number' && Number.isFinite(lastReviewed)))) return null
  return {
    ease: Math.max(MIN_EASE, Math.min(MAX_EASE, ease)),
    intervalDays: Math.max(0, Math.min(MAX_INTERVAL_DAYS, Math.round(intervalDays))),
    due: Math.max(0, due), reps: Math.max(0, Math.min(100000, Math.floor(reps))),
    lapses: Math.max(0, Math.min(100000, Math.floor(lapses))),
    lastGrade: lastGrade as ReviewGrade | null,
    lastReviewed: lastReviewed === null ? null : Math.max(0, lastReviewed),
  }
}

/** Parses untrusted Firestore data, retaining only valid, bounded card states. */
export function parseDeckProgress(value: unknown, today: string): DeckProgress {
  try {
    if (!isRecord(value) || !isRecord(value.cards)) return emptyProgress(today)
    const cards: Record<string, CardState> = {}
    for (const [id, rawState] of Object.entries(value.cards).slice(0, MAX_PROGRESS_CARDS)) {
      if (!id || id.length > 128) continue
      const state = parseCardState(rawState)
      if (state) cards[id] = state
    }
    const sameDay = validDay(value.newDay) && value.newDay === today
    const count = typeof value.newCount === 'number' && Number.isFinite(value.newCount) ? Math.floor(value.newCount) : 0
    return {
      version: 1,
      cards,
      newDay: today,
      newCount: sameDay ? Math.max(0, Math.min(MAX_PROGRESS_CARDS, count)) : 0,
    }
  } catch {
    return emptyProgress(today)
  }
}

export function recordGrade(progress: DeckProgress, cardId: string, grade: ReviewGrade, now: number, today: string): DeckProgress {
  const exists = Object.hasOwn(progress.cards, cardId)
  if (!exists && Object.keys(progress.cards).length >= MAX_PROGRESS_CARDS) throw new ProgressLimitError()
  const sameDay = progress.newDay === today
  return {
    version: 1,
    cards: { ...progress.cards, [cardId]: scheduleReview(progress.cards[cardId] ?? null, grade, now) },
    newDay: today,
    newCount: (sameDay ? progress.newCount : 0) + (exists ? 0 : 1),
  }
}

export function pruneProgress(progress: DeckProgress, activeCardIds: readonly string[]): DeckProgress {
  const active = new Set(activeCardIds)
  const cards = Object.fromEntries(Object.entries(progress.cards).filter(([id]) => active.has(id)))
  return { ...progress, cards }
}

/** A defensive initial state helper for callers needing a missing card's baseline. */
export const missingCardState = initialCardState
