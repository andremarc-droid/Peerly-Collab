import type { AnswerVerdict } from './grading'
import type { QuizKind, QuizQuestion } from './quiz'
export interface PracticeTestConfig {
  questionCount: number
  kinds: QuizKind[]
  timeLimitSeconds: number | null
}

export interface TestReview {
  question: QuizQuestion
  response: string | number | null
  correct: boolean | null
}
export interface TestAttempt {
  deckKey: string
  createdAt: number
  startedAt: number
  durationSeconds: number
  timeLimitSeconds: number | null
  score: number
  maxScore: number
  review: TestReview[]
}
export function remainingSeconds(startedAt: number, timeLimitSeconds: number | null, now: number): number | null {
  return timeLimitSeconds === null
    ? null
    : Math.max(0, Math.ceil(timeLimitSeconds - (now - startedAt) / 1000))
}

export function isTimeUp(startedAt: number, timeLimitSeconds: number | null, now: number): boolean {
  return timeLimitSeconds !== null && remainingSeconds(startedAt, timeLimitSeconds, now) === 0
}
export function scoreTest(
  questions: QuizQuestion[],
  responses: (string | number | null)[],
  verdicts: (AnswerVerdict | null)[],
  deckKey: string,
  createdAt: number,
  startedAt = createdAt,
  timeLimitSeconds: number | null = null,
): TestAttempt {
  const review = questions.slice(0, 50).map((question, index): TestReview => ({
    question,
    response: responses[index] ?? null,
    correct: verdicts[index] === 'unsure' || verdicts[index] === null ? null : verdicts[index] === 'correct',
  }))
  const score = review.filter(item => item.correct === true).length
  return {
    deckKey,
    createdAt,
    startedAt,
    durationSeconds: Math.max(0, Math.floor((createdAt - startedAt) / 1000)),
    timeLimitSeconds,
    score,
    maxScore: review.length,
    review,
  }
}
export function parseQuestion(value: unknown): QuizQuestion | null {
  if (!value || typeof value !== 'object') return null
  const q = value as Partial<QuizQuestion>
  if (
    typeof q.id !== 'string' || q.id.length < 1 || q.id.length > 128
    || typeof q.prompt !== 'string' || q.prompt.length > 300
    || typeof q.answer !== 'string' || q.answer.length > 600
    || typeof q.explanation !== 'string' || q.explanation.length > 400
    || !['written', 'multiple-choice'].includes(q.kind ?? '')
  ) return null

  if (q.kind === 'multiple-choice' && (
    !Array.isArray(q.options)
    || q.options.length < 2
    || q.options.length > 6
    || !Number.isInteger(q.correctIndex)
    || q.correctIndex! < 0
    || q.correctIndex! >= q.options.length
    || q.options.some(option => typeof option !== 'string' || option.length > 300)
  )) return null

  return {
    id: q.id,
    ...(typeof q.cardId === 'string' ? { cardId: q.cardId } : {}),
    kind: q.kind!,
    prompt: q.prompt,
    answer: q.answer,
    explanation: q.explanation,
    ...(q.kind === 'multiple-choice' ? { options: q.options, correctIndex: q.correctIndex! } : {}),
  }
}
export function parseTestAttempt(value: unknown): TestAttempt | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<TestAttempt>
  if (
    typeof v.deckKey !== 'string'
    || typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt)
    || typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) || v.startedAt > v.createdAt
    || !Number.isInteger(v.durationSeconds) || v.durationSeconds! < 0
    || !(v.timeLimitSeconds === null || (
      Number.isInteger(v.timeLimitSeconds)
      && v.timeLimitSeconds! >= 0
      && v.timeLimitSeconds! <= 10800
    ))
    || !Number.isInteger(v.score)
    || !Number.isInteger(v.maxScore)
    || !Array.isArray(v.review)
    || v.review.length > 50
    || v.review.length !== v.maxScore
    || v.score! < 0
    || v.score! > v.maxScore!
  ) return null

  const review: TestReview[] = []
  for (const item of v.review) {
    if (!item || typeof item !== 'object') return null
    const entry = item as TestReview
    const question = parseQuestion(entry.question)
    const validResponse = typeof entry.response === 'string'
      || typeof entry.response === 'number'
      || entry.response === null
    const validVerdict = typeof entry.correct === 'boolean' || entry.correct === null
    if (!question || !validResponse || !validVerdict) return null
    review.push({ question, response: entry.response, correct: entry.correct })
  }

  return {
    deckKey: v.deckKey,
    createdAt: v.createdAt,
    startedAt: v.startedAt,
    durationSeconds: v.durationSeconds!,
    timeLimitSeconds: v.timeLimitSeconds!,
    score: v.score!,
    maxScore: v.maxScore!,
    review,
  }
}
