import { gradeAttempt, type QuizQuestionRecord } from '../grading/grade'
import { normalizeAnswer } from '../grading/normalize'
import type { AnswerKey, QuizAttempt, QuizResult } from '../types'

export type AttemptResult = QuizAttempt & { id: string; result: QuizResult | null }

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

export function summarizeAttempts(attempts: AttemptResult[], ungraded = false) {
  const submitted = attempts.filter((item) => item.status === 'submitted')
  const best = bestAttempts(attempts)
  const scores = ungraded ? [] : best.flatMap(({ result }) => result && result.maxScore > 0 ? [result.score / result.maxScore * 100] : [])
  const average = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null
  return {
    submissions: submitted.length,
    inProgress: attempts.filter(({ status }) => status === 'in_progress').length,
    submitted: submitted.length,
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
  const add = (answer: string, accepted: string[]) => {
    const cleaned = answer.trim().replace(/\s+/g, ' ')
    if (!cleaned || accepted.some((item) => normalizeAnswer(item, input.key.caseSensitive) === normalizeAnswer(cleaned, input.key.caseSensitive))) return
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

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
export function resultsCsv(attempts: AttemptResult[], ungraded = false): string {
  const rows: Array<Array<string | number>> = [['Student', 'User ID', 'Attempt', 'Status', 'Score', 'Time spent (seconds)', 'Submitted at']]
  for (const attempt of attempts) rows.push([
    attempt.userName, attempt.userId, attempt.attemptNumber, attempt.status,
    ungraded || !attempt.result ? 'Ungraded' : `${attempt.result.score}/${attempt.result.maxScore}`,
    attempt.timeSpentSeconds, attempt.submittedAt?.toDate().toISOString() ?? '',
  ])
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
