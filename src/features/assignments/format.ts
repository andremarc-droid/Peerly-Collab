import { Timestamp } from 'firebase/firestore'
import { MAX_POINTS, type AssignmentRecord, type AssignmentWithId, type TurnInRecord, type TurnInState } from './types'

const pad = (value: number) => String(value).padStart(2, '0')

export function formatDue(dueAt: Timestamp | null, locale?: string): string {
  if (!dueAt) return 'No due date'
  return `Due ${dueAt.toDate().toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}`
}

export function formatPoints(points: number | null): string {
  if (points === null) return 'Ungraded'
  return `${points} ${points === 1 ? 'point' : 'points'}`
}

/** Whole number from 0 to MAX_POINTS, null for blank text, or undefined when the text is not a valid value. */
export function parsePoints(value: string): number | null | undefined {
  const text = value.trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return undefined
  const number = Number(text)
  return number <= MAX_POINTS ? number : undefined
}

export function formatTurnedIn(value: Timestamp, locale?: string): string {
  return value.toDate().toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Value for an <input type="datetime-local">, in the viewer's local time. */
export function toLocalInputValue(value: Timestamp | null): string {
  if (!value) return ''
  const date = value.toDate()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInputValue(value: string): Timestamp | null {
  if (!value) return null
  const millis = new Date(value).getTime()
  return Number.isNaN(millis) ? null : Timestamp.fromMillis(millis)
}

export function isLate(dueAt: Timestamp | null, turnedInAt: Timestamp): boolean {
  return dueAt !== null && turnedInAt.toMillis() > dueAt.toMillis()
}

export function turnInState(
  assignment: Pick<AssignmentRecord, 'dueAt' | 'acceptsTurnIn'>,
  turnIn: (Pick<TurnInRecord, 'turnedInAt'> & Partial<Pick<TurnInRecord, 'gradedAt'>>) | null,
  now: number = Date.now(),
): TurnInState {
  if (!assignment.acceptsTurnIn) return 'not_required'
  if (turnIn?.gradedAt) return 'graded'
  if (turnIn) return isLate(assignment.dueAt, turnIn.turnedInAt) ? 'turned_in_late' : 'turned_in'
  if (assignment.dueAt && now > assignment.dueAt.toMillis()) return 'missing'
  return 'assigned'
}

export const turnInStateLabel: Record<TurnInState, string> = {
  not_required: 'No turn-in needed',
  assigned: 'Assigned',
  missing: 'Missing',
  turned_in: 'Turned in',
  turned_in_late: 'Turned in late',
  graded: 'Graded',
}

/** "85 / 100" when the assignment has points, otherwise just the number. */
export function formatGrade(grade: number, points: number | null): string {
  return points === null ? String(grade) : `${grade} / ${points}`
}

/** Due soonest first, then undated work, newest first. */
export function sortForStudents(items: AssignmentWithId[]): AssignmentWithId[] {
  return [...items].sort((a, b) => {
    if (a.dueAt && b.dueAt) return a.dueAt.toMillis() - b.dueAt.toMillis()
    if (a.dueAt) return -1
    if (b.dueAt) return 1
    return b.createdAt.toMillis() - a.createdAt.toMillis()
  })
}
