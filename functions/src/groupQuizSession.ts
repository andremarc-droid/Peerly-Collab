import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import { GroupQuizError, questionDeadline, type Answer } from './groupQuizLogic.js'
import { gradeQuestion, type GradableKey, type GradableQuestion } from './groupQuizGrading.js'
import type { QuizInfo, SessionQuestion } from './groupQuizData.js'

/** Builders for what a team may see. The session holds the CURRENT question only and never an answer key. */

export const PLAYABLE_TYPES = ['multiple_choice', 'true_false', 'identification', 'fill_blank'] as const
export type PlayableType = (typeof PLAYABLE_TYPES)[number]
export const isPlayableType = (type: unknown): type is PlayableType => PLAYABLE_TYPES.includes(type as PlayableType)

export function toSessionQuestion(snap: DocumentSnapshot, index: number, optionOrder: readonly string[] | undefined): SessionQuestion {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('A question of this quiz was removed.', 'failed-precondition')
  if (!isPlayableType(data.type) || typeof data.prompt !== 'string' || typeof data.points !== 'number') throw new GroupQuizError('This quiz has a question that teams cannot answer.', 'failed-precondition')
  const raw: Array<{ id: string; text: string }> = Array.isArray(data.options)
    ? data.options.filter((item: unknown): item is { id: string; text: string } => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string' && typeof (item as { text?: unknown }).text === 'string')
    : []
  const ordered = optionOrder
    ? [
      ...optionOrder.flatMap(id => raw.filter(option => option.id === id)),
      ...raw.filter(option => !optionOrder.includes(option.id)),
    ]
    : raw
  return { id: snap.id, index, type: data.type, prompt: data.prompt, points: data.points, options: ordered.map(({ id, text }) => ({ id, text })) }
}

export function readKey(snap: DocumentSnapshot): GradableKey {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('This quiz is missing an answer key.', 'failed-precondition')
  const explanation = typeof data.explanation === 'string' ? data.explanation : ''
  const caseSensitive = data.caseSensitive === true
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
  if (data.type === 'choice' && typeof data.correctOptionId === 'string') return { type: 'choice', correctOptionId: data.correctOptionId, explanation, caseSensitive }
  if (data.type === 'identification' && strings(data.acceptedAnswers)) return { type: 'identification', acceptedAnswers: data.acceptedAnswers, explanation, caseSensitive }
  if (data.type === 'fill_blank' && Array.isArray(data.blanks) && data.blanks.every(strings)) return { type: 'fill_blank', blanks: data.blanks as string[][], explanation, caseSensitive }
  throw new GroupQuizError('This quiz has an answer key teams cannot be graded with.', 'failed-precondition')
}

export function correctAnswerOf(key: GradableKey): Answer {
  if (key.type === 'choice') return key.correctOptionId
  if (key.type === 'identification') return key.acceptedAnswers[0] ?? ''
  return key.blanks.map(accepted => accepted[0] ?? '')
}

/** Fields of a session document that is open on `question`. */
export function openSessionFields(question: SessionQuestion, total: number, quiz: QuizInfo, nowMs: number) {
  return {
    phase: 'answering' as const,
    currentIndex: question.index,
    total,
    questionStartedAt: nowMs,
    questionEndsAt: questionDeadline(nowMs, quiz.settings.questionTimeSec),
    reviewStartedAt: null,
    question,
    answered: {} as Record<string, true>,
    picks: null,
    locked: false,
    ready: {} as Record<string, true>,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

export function finishedSessionFields(total: number) {
  return {
    phase: 'finished' as const,
    currentIndex: total,
    total,
    questionStartedAt: null,
    questionEndsAt: null,
    reviewStartedAt: null,
    question: null,
    answered: {} as Record<string, true>,
    picks: null,
    locked: false,
    ready: {} as Record<string, true>,
    updatedAt: FieldValue.serverTimestamp(),
  }
}

/**
 * The reveal a team sees after a question closes. Correctness, the right answer and the explanation are included only when the
 * quiz reveals answers after each question; otherwise the team sees only what was chosen.
 */
export function buildReveal(input: {
  quiz: QuizInfo
  question: SessionQuestion
  key: GradableKey | null
  finalAnswer: Answer | null
  picks: Record<string, Answer>
  lockedBy: string | null
  auto: boolean
}) {
  let result: { correct: boolean; pointsAwarded: number; correctAnswer: Answer; explanation: string } | null = null
  if (input.quiz.answerReveal === 'after_each' && input.key) {
    const gradable: GradableQuestion = { id: input.question.id, type: input.question.type as PlayableType, points: input.question.points }
    const graded = gradeQuestion(gradable, input.key, input.finalAnswer ?? undefined)
    result = { correct: graded.correct, pointsAwarded: graded.pointsAwarded, correctAnswer: correctAnswerOf(input.key), explanation: input.key.explanation }
  }
  return {
    index: input.question.index,
    questionId: input.question.id,
    question: { type: input.question.type, prompt: input.question.prompt, points: input.question.points, options: input.question.options },
    finalAnswer: input.finalAnswer,
    picks: input.picks,
    lockedBy: input.lockedBy,
    auto: input.auto,
    result,
    createdAt: FieldValue.serverTimestamp(),
  }
}
