import { gradeAttempt, type QuizQuestionRecord } from '../grading/grade'
import { normalizeAnswer } from '../grading/normalize'
import type { AnswerKey, QuizAttempt, QuizResult } from '../types'
import type { EnrollmentWithId } from '../../classes/types'

export type AttemptResult = QuizAttempt & { id: string; result: QuizResult | null }
export type ResultListRow = { userId: string; userName: string; attempt: AttemptResult | null; membership: 'enrolled' | 'not_started' | 'no_longer_enrolled' }

export function buildRosterRows(enrollments: EnrollmentWithId[], attempts: AttemptResult[]): ResultListRow[] {
  const active = new Map(enrollments.filter((item) => item.status === 'active').map((item) => [item.uid, item]))
  const rows: ResultListRow[] = attempts.map((attempt) => ({
    userId: attempt.userId, userName: attempt.userName || active.get(attempt.userId)?.studentName || attempt.userId,
    attempt, membership: active.has(attempt.userId) ? 'enrolled' : 'no_longer_enrolled',
  }))
  for (const enrollment of active.values()) {
    if (!attempts.some((attempt) => attempt.userId === enrollment.uid)) rows.push({ userId: enrollment.uid, userName: enrollment.studentName || enrollment.uid, attempt: null, membership: 'not_started' })
  }
  return rows
}

export function bestAttempts(attempts: AttemptResult[]) {
  const best = new Map<string, AttemptResult>()
  for (const attempt of attempts) {
    if (attempt.status !== 'submitted' || !attempt.result) continue
    const previous = best.get(attempt.userId)
    const score = attempt.result.score / (attempt.result.maxScore || 1)
    const previousScore = previous?.result ? previous.result.score / (previous.result.maxScore || 1) : -1
    if (!previous || score > previousScore) best.set(attempt.userId, attempt)
  }
  return [...best.values()]
}

export function computeTimeSpent(
  startedAt: { toMillis?: () => number } | Date | number | null | undefined,
  submittedAt: { toMillis?: () => number } | Date | number | null | undefined,
): number | null {
  if (!startedAt || !submittedAt) return null
  const toMs = (val: { toMillis?: () => number } | Date | number): number | null => {
    if (typeof val === 'number') return val
    if (val instanceof Date) return val.getTime()
    if (typeof val === 'object' && 'toMillis' in val && typeof val.toMillis === 'function') return val.toMillis()
    return null
  }
  const startMs = toMs(startedAt)
  const submitMs = toMs(submittedAt)
  if (startMs === null || submitMs === null) return null
  return Math.max(0, Math.floor((submitMs - startMs) / 1000))
}

export function isLate(
  startedAt: { toMillis?: () => number } | Date | number | null | undefined,
  submittedAt: { toMillis?: () => number } | Date | number | null | undefined,
  timeLimitMinutes: number | null | undefined,
  graceSeconds = 120,
): { late: boolean; lateBySeconds: number } {
  if (timeLimitMinutes == null || timeLimitMinutes <= 0 || !startedAt || !submittedAt) {
    return { late: false, lateBySeconds: 0 }
  }
  const elapsedSeconds = computeTimeSpent(startedAt, submittedAt)
  if (elapsedSeconds === null) {
    return { late: false, lateBySeconds: 0 }
  }
  const limitSeconds = timeLimitMinutes * 60
  if (elapsedSeconds <= limitSeconds + graceSeconds) {
    return { late: false, lateBySeconds: 0 }
  }
  return { late: true, lateBySeconds: elapsedSeconds - limitSeconds }
}

export function summarizeAttempts(attempts: AttemptResult[], ungraded = false, timeLimitMinutes: number | null = null) {
  const submitted = attempts.filter((item) => item.status === 'submitted')
  const lateSubmissions = timeLimitMinutes
    ? submitted.filter((item) => isLate(item.startedAt, item.submittedAt, timeLimitMinutes).late).length
    : 0
  const best = bestAttempts(attempts)
  const scores = ungraded ? [] : best.flatMap(({ result }) => result && result.maxScore > 0 ? [result.score / result.maxScore * 100] : [])
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null
  return {
    submissions: submitted.length,
    inProgress: attempts.filter(({ status }) => status === 'in_progress').length,
    submitted: submitted.length,
    lateSubmissions,
    average: average === null ? null : Math.round(average),
    highest: scores.length ? Math.round(Math.max(...scores)) : null,
    lowest: scores.length ? Math.round(Math.min(...scores)) : null,
    bestStudentCount: best.length,
  }
}

export function applyQuestionOverride(result: QuizResult, questionId: string, pointsAwarded: number, maxPoints: number): QuizResult {
  if (!Number.isFinite(pointsAwarded) || pointsAwarded < 0 || pointsAwarded > maxPoints) throw new Error(`Points must be between 0 and ${maxPoints}`)
  const prior = result.perQuestion[questionId]
  if (!prior) throw new Error(`Question ${questionId} is not in this result`)
  const perQuestion = { ...result.perQuestion, [questionId]: { correct: pointsAwarded >= maxPoints, pointsAwarded, overridden: true } }
  return { ...result, perQuestion, score: Math.round(Object.values(perQuestion).reduce((sum, item) => sum + item.pointsAwarded, 0) * 100) / 100 }
}

export function recalculateAutomaticGrade(input: {
  result: QuizResult; question: QuizQuestionRecord; key: AnswerKey; attempt: QuizAttempt
}): QuizResult {
  const recalculated = gradeAttempt({
    userId: input.result.userId, questions: [input.question], answerKeys: { [input.question.id]: input.key },
    answers: input.attempt.answers,
  }).perQuestion[input.question.id]
  const previous = input.result.perQuestion[input.question.id]
  if (!previous) throw new Error(`Question ${input.question.id} is not in this result`)
  const perQuestion = { ...input.result.perQuestion, [input.question.id]: recalculated }
  return { ...input.result, perQuestion, score: Math.round((input.result.score - previous.pointsAwarded + recalculated.pointsAwarded) * 100) / 100 }
}

export function typedWrongAnswerCounts(input: {
  question: QuizQuestionRecord; key: AnswerKey; attempts: AttemptResult[]
}): Array<{ answer: string; count: number }> {
  const counts = new Map<string, number>()
  const caseSensitive = 'caseSensitive' in input.key ? input.key.caseSensitive : false
  const add = (answer: string, accepted: string[]) => {
    const cleaned = answer.trim().replace(/\s+/g, ' ')
    if (!cleaned || accepted.some((item) => normalizeAnswer(item, caseSensitive) === normalizeAnswer(cleaned, caseSensitive))) return
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1)
  }
  for (const attempt of input.attempts) {
    if (attempt.status !== 'submitted') continue
    const answer = attempt.answers[input.question.id]
    if (input.key.type === 'identification' && typeof answer === 'string') add(answer, input.key.acceptedAnswers)
    if (input.key.type === 'fill_blank' && Array.isArray(answer)) answer.forEach((value, index) => add(value, input.key.type === 'fill_blank' ? input.key.blanks[index] ?? [] : []))
  }
  return [...counts].map(([answer, count]) => ({ answer, count })).sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer)).slice(0, 5)
}

export const csvCell = (value: string | number): string => {
  if (typeof value === 'number') return `"${value}"`
  const text = String(value)
  const isFormula = /^[=+\-@\t\r]/.test(text)
  const safeText = isFormula ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

export function resultsCsv(attempts: AttemptResult[], ungraded = false, className = '', timeLimitMinutes: number | null = null): string {
  const rows: Array<Array<string | number>> = [['Student', 'User ID', 'Class', 'Attempt', 'Status', 'Score', 'Late', 'Time spent (seconds)', 'Submitted at']]
  for (const attempt of attempts) {
    const lateInfo = isLate(attempt.startedAt, attempt.submittedAt, timeLimitMinutes)
    const lateCell = attempt.status === 'submitted'
      ? (lateInfo.late ? `Late (${Math.max(1, Math.round(lateInfo.lateBySeconds / 60))} min)` : 'No')
      : '—'
    const timeSpent = attempt.status === 'submitted'
      ? computeTimeSpent(attempt.startedAt, attempt.submittedAt)
      : null
    rows.push([
      attempt.userName, attempt.userId, className, attempt.attemptNumber, attempt.status,
      ungraded || !attempt.result ? 'Ungraded' : `${attempt.result.score}/${attempt.result.maxScore}`,
      lateCell,
      timeSpent !== null ? timeSpent : '—',
      attempt.submittedAt?.toDate().toISOString() ?? '',
    ])
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
