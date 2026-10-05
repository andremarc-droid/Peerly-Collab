import { Timestamp } from 'firebase/firestore'
import type {
  AnswerKey, Quiz, QuizAttempt, QuizParticipant, QuizQuestion, QuizResult, QuizSettings,
} from '../types'
import { validateCanvasDefinition, validateCanvasKey } from '../../canvas/schemas'

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainValidationError'
  }
}

type RecordValue = Record<string, unknown>
const record = (value: unknown, name: string): RecordValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new DomainValidationError(`${name} must be an object`)
  return value as RecordValue
}
const exactKeys = (value: RecordValue, keys: string[], name: string) => {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new DomainValidationError(`${name} contains unsupported fields`)
}
const string = (value: unknown, name: string, allowEmpty = false): string => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new DomainValidationError(`${name} must be a${allowEmpty ? ' string' : ' non-empty string'}`)
  return value
}
const bool = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new DomainValidationError(`${name} must be a boolean`)
  return value
}
const integer = (value: unknown, name: string, minimum = 0): number => {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new DomainValidationError(`${name} must be an integer of at least ${minimum}`)
  return value as number
}
const timestamp = (value: unknown, name: string): Timestamp => {
  if (!(value instanceof Timestamp)) throw new DomainValidationError(`${name} must be a Firestore timestamp`)
  return value
}
const oneOf = <T extends string>(value: unknown, values: readonly T[], name: string): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new DomainValidationError(`${name} is invalid`)
  return value as T
}

const quizKeys = ['ownerId', 'ownerName', 'classId', 'title', 'description', 'tags', 'mode', 'status', 'questionCount', 'createdAt', 'updatedAt', 'publishedAt', 'settings']
const settingsKeys = ['answerReveal', 'participation', 'scoreVisibility', 'scoresReleased', 'timeLimitMinutes', 'attemptsAllowed', 'shuffleQuestions', 'shuffleOptions']

export function parseQuizSettings(value: unknown, mode: Quiz['mode']): QuizSettings {
  const settings = record(value, 'settings')
  exactKeys(settings, settingsKeys, 'settings')
  const participation = record(settings.participation, 'settings.participation')
  const participationType = oneOf(participation.type, ['individual', 'group'] as const, 'settings.participation.type')
  exactKeys(participation, participationType === 'group' ? ['type', 'groupSize'] : ['type'], 'settings.participation')
  const parsedParticipation = participationType === 'group'
    ? { type: 'group' as const, groupSize: integer(participation.groupSize, 'groupSize', 2) }
    : { type: 'individual' as const }
  if (parsedParticipation.type === 'group' && parsedParticipation.groupSize > 10) throw new DomainValidationError('groupSize cannot exceed 10')
  const answerReveal = oneOf(settings.answerReveal, ['after_each', 'after_submit', 'never'] as const, 'answerReveal')
  const scoreVisibility = oneOf(settings.scoreVisibility, ['immediate', 'after_release', 'hidden'] as const, 'scoreVisibility')
  if (mode === 'flashcards' && (answerReveal !== 'never' || scoreVisibility !== 'hidden' || settings.scoresReleased !== false)) {
    throw new DomainValidationError('Flashcard quizzes must use neutral answer and score settings')
  }
  if (mode === 'canvas' && parsedParticipation.type !== 'individual') {
    throw new DomainValidationError('Canvas quizzes must use individual participation')
  }
  const timeLimitMinutes = settings.timeLimitMinutes
  const attemptsAllowed = settings.attemptsAllowed
  if (timeLimitMinutes !== null && (!Number.isInteger(timeLimitMinutes) || (timeLimitMinutes as number) < 1)) throw new DomainValidationError('timeLimitMinutes must be null or a positive integer')
  if (attemptsAllowed !== null && (!Number.isInteger(attemptsAllowed) || (attemptsAllowed as number) < 1)) throw new DomainValidationError('attemptsAllowed must be null or a positive integer')
  return {
    answerReveal, participation: parsedParticipation, scoreVisibility,
    scoresReleased: bool(settings.scoresReleased, 'scoresReleased'),
    timeLimitMinutes: timeLimitMinutes as number | null,
    attemptsAllowed: attemptsAllowed as number | null,
    shuffleQuestions: bool(settings.shuffleQuestions, 'shuffleQuestions'),
    shuffleOptions: bool(settings.shuffleOptions, 'shuffleOptions'),
  }
}

export function parseQuiz(value: unknown): Quiz {
  const quiz = record(value, 'quiz')
  exactKeys(quiz, quizKeys, 'quiz')
  const mode = oneOf(quiz.mode, ['quiz', 'flashcards', 'canvas'] as const, 'mode')
  if (!Array.isArray(quiz.tags) || !quiz.tags.every((tag) => typeof tag === 'string')) throw new DomainValidationError('tags must be a list of strings')
  if (quiz.tags.length > 20) throw new DomainValidationError('tags must not exceed 20 items')
  const title = string(quiz.title, 'title', true)
  if (title.length > 200) throw new DomainValidationError('title must not exceed 200 characters')
  const description = string(quiz.description, 'description', true)
  if (description.length > 2000) throw new DomainValidationError('description must not exceed 2000 characters')
  return {
    ownerId: string(quiz.ownerId, 'ownerId'), ownerName: string(quiz.ownerName, 'ownerName'),
    classId: quiz.classId === undefined || quiz.classId === null ? null : string(quiz.classId, 'classId'),
    title, description,
    tags: quiz.tags as string[], mode, status: oneOf(quiz.status, ['draft', 'published', 'archived'] as const, 'status'),
    questionCount: integer(quiz.questionCount, 'questionCount'), createdAt: timestamp(quiz.createdAt, 'createdAt'),
    updatedAt: timestamp(quiz.updatedAt, 'updatedAt'),
    publishedAt: quiz.publishedAt === null ? null : timestamp(quiz.publishedAt, 'publishedAt'),
    settings: parseQuizSettings(quiz.settings, mode),
  }
}

export function parseQuestion(value: unknown): QuizQuestion {
  const question = record(value, 'question')
  const type = oneOf(question.type, ['multiple_choice', 'true_false', 'identification', 'fill_blank', 'flashcard', 'canvas'] as const, 'question.type')
  if (type === 'canvas') return validateCanvasDefinition(question)
  const hasOptions = type === 'multiple_choice' || type === 'true_false'
  exactKeys(question, hasOptions ? ['order', 'type', 'prompt', 'options', 'points'] : ['order', 'type', 'prompt', 'points'], 'question')
  const prompt = string(question.prompt, 'prompt')
  if (prompt.length > 2000) throw new DomainValidationError('prompt must not exceed 2000 characters')
  const base = { order: integer(question.order, 'order'), prompt, points: integer(question.points, 'points', 1) }
  if (type === 'identification' || type === 'fill_blank' || type === 'flashcard') return { ...base, type }
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) throw new DomainValidationError(`${type} requires 2–6 options`)
  if (type === 'true_false' && question.options.length !== 2) throw new DomainValidationError('true_false requires exactly two options')
  const options = question.options.map((item, index) => {
    const option = record(item, `options[${index}]`)
    exactKeys(option, ['id', 'text'], 'option')
    const text = string(option.text, 'option.text')
    if (text.length > 500) throw new DomainValidationError('option text must not exceed 500 characters')
    return { id: string(option.id, 'option.id'), text }
  })
  if (new Set(options.map(({ id }) => id)).size !== options.length) throw new DomainValidationError('Option ids must be unique')
  return { ...base, type, options }
}

export function parseAnswerKey(value: unknown): AnswerKey {
  const key = record(value, 'answerKey')
  const type = oneOf(key.type, ['choice', 'identification', 'fill_blank', 'flashcard', 'canvas'] as const, 'answerKey.type')
  if (type === 'canvas') return validateCanvasKey(key)
  const base = { explanation: string(key.explanation, 'explanation', true), caseSensitive: bool(key.caseSensitive, 'caseSensitive') }
  if (type === 'choice') {
    exactKeys(key, ['type', 'correctOptionId', 'explanation', 'caseSensitive'], 'answerKey')
    return { ...base, type, correctOptionId: string(key.correctOptionId, 'correctOptionId') }
  }
  if (type === 'identification') {
    exactKeys(key, ['type', 'acceptedAnswers', 'explanation', 'caseSensitive'], 'answerKey')
    if (!Array.isArray(key.acceptedAnswers) || key.acceptedAnswers.length === 0 || !key.acceptedAnswers.every((item) => typeof item === 'string' && item.trim())) throw new DomainValidationError('acceptedAnswers must contain non-empty strings')
    return { ...base, type, acceptedAnswers: key.acceptedAnswers }
  }
  if (type === 'fill_blank') {
    exactKeys(key, ['type', 'blanks', 'explanation', 'caseSensitive'], 'answerKey')
    if (!Array.isArray(key.blanks) || key.blanks.length === 0 || !key.blanks.every((items) => Array.isArray(items) && items.length > 0 && items.every((item) => typeof item === 'string' && item.trim()))) throw new DomainValidationError('blanks must contain accepted answers for every blank')
    return { ...base, type, blanks: key.blanks as string[][] }
  }
  exactKeys(key, ['type', 'back', 'explanation', 'caseSensitive'], 'answerKey')
  return { ...base, type, back: string(key.back, 'back') }
}

export function validateQuestionAnswerPair(questionValue: unknown, keyValue: unknown): { question: QuizQuestion; answerKey: AnswerKey } {
  const question = parseQuestion(questionValue)
  const answerKey = parseAnswerKey(keyValue)
  if (question.type === 'canvas') {
    if (answerKey.type !== 'canvas') throw new DomainValidationError('canvas requires a canvas answer key')
    return { question, answerKey: validateCanvasKey(keyValue, question.cards, question.directed) }
  }
  const expectedKeyType = question.type === 'multiple_choice' || question.type === 'true_false'
    ? 'choice'
    : question.type === 'identification' ? 'identification' : question.type
  if (answerKey.type !== expectedKeyType) throw new DomainValidationError(`${question.type} requires a ${expectedKeyType} answer key`)
  if (answerKey.type === 'choice' && (question.type === 'multiple_choice' || question.type === 'true_false') && !question.options.some((option) => option.id === answerKey.correctOptionId)) throw new DomainValidationError('correctOptionId must match an option id')
  if (answerKey.type === 'fill_blank') {
    const blankCount = question.prompt.match(/_{3,}|\[blank\]/gi)?.length
    if (blankCount !== undefined && blankCount !== answerKey.blanks.length) throw new DomainValidationError('Answer key blank count must match prompt blanks')
  }
  return { question, answerKey }
}

export function parseQuizAttempt(value: unknown): QuizAttempt {
  const attempt = record(value, 'attempt')
  exactKeys(attempt, ['userId', 'userName', 'attemptNumber', 'status', 'answers', 'questionOrder', 'optionOrder', 'startedAt', 'submittedAt', 'timeSpentSeconds'], 'attempt')
  const answers = record(attempt.answers, 'answers')
  if (Object.keys(answers).length > 200) throw new DomainValidationError('answers must not exceed 200 items')
  for (const [id, answer] of Object.entries(answers)) {
    string(id, 'answer question id')
    if (typeof answer !== 'string' && !(Array.isArray(answer) && answer.every((item) => typeof item === 'string'))) throw new DomainValidationError('answers must be strings or lists of strings')
  }
  const optionOrder = record(attempt.optionOrder, 'optionOrder')
  if (!Object.values(optionOrder).every((order) => Array.isArray(order) && order.every((id) => typeof id === 'string'))) throw new DomainValidationError('optionOrder must map to lists of strings')
  if (!Array.isArray(attempt.questionOrder) || !attempt.questionOrder.every((id) => typeof id === 'string')) throw new DomainValidationError('questionOrder must be a list of strings')
  return {
    userId: string(attempt.userId, 'userId'), userName: string(attempt.userName, 'userName'),
    attemptNumber: integer(attempt.attemptNumber, 'attemptNumber', 1),
    status: oneOf(attempt.status, ['in_progress', 'submitted'] as const, 'status'),
    answers: answers as QuizAttempt['answers'], questionOrder: attempt.questionOrder,
    optionOrder: optionOrder as QuizAttempt['optionOrder'], startedAt: timestamp(attempt.startedAt, 'startedAt'),
    submittedAt: attempt.submittedAt === null ? null : timestamp(attempt.submittedAt, 'submittedAt'),
    timeSpentSeconds: integer(attempt.timeSpentSeconds, 'timeSpentSeconds'),
  }
}

export function parseQuizParticipant(value: unknown): QuizParticipant {
  const participant = record(value, 'participant')
  exactKeys(participant, ['userId', 'userName', 'createdAt', 'updatedAt', 'attemptCount', 'activeAttemptId'], 'participant')
  return {
    userId: string(participant.userId, 'userId'), userName: string(participant.userName, 'userName'),
    createdAt: timestamp(participant.createdAt, 'createdAt'), updatedAt: timestamp(participant.updatedAt, 'updatedAt'),
    attemptCount: integer(participant.attemptCount, 'attemptCount'),
    activeAttemptId: participant.activeAttemptId === null ? null : string(participant.activeAttemptId, 'activeAttemptId'),
  }
}

export function parseQuizResult(value: unknown): QuizResult {
  const result = record(value, 'result')
  exactKeys(result, ['userId', 'score', 'maxScore', 'perQuestion', 'gradedAt'], 'result')
  const perQuestion = record(result.perQuestion, 'perQuestion')
  const parsed: QuizResult['perQuestion'] = {}
  for (const [id, value] of Object.entries(perQuestion)) {
    const item = record(value, `perQuestion.${id}`)
    exactKeys(item, ['correct', 'pointsAwarded', 'overridden'], 'questionResult')
    if (item.correct !== null && typeof item.correct !== 'boolean') throw new DomainValidationError(`perQuestion.${id}.correct must be boolean or null`)
    if (typeof item.pointsAwarded !== 'number' || !Number.isFinite(item.pointsAwarded) || item.pointsAwarded < 0) throw new DomainValidationError(`perQuestion.${id}.pointsAwarded must be non-negative`)
    parsed[id] = { correct: item.correct, pointsAwarded: item.pointsAwarded, overridden: bool(item.overridden, 'overridden') }
  }
  for (const field of ['score', 'maxScore'] as const) {
    if (typeof result[field] !== 'number' || !Number.isFinite(result[field]) || result[field] < 0) throw new DomainValidationError(`${field} must be non-negative`)
  }
  return { userId: string(result.userId, 'userId'), score: result.score as number, maxScore: result.maxScore as number, perQuestion: parsed, gradedAt: timestamp(result.gradedAt, 'gradedAt') }
}
