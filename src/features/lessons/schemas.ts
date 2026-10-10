import type { QuizQuestion } from '../studyEngine/quiz'
import type { Flashcard } from '../flashcards/types'
import type { Lesson, LessonCompletion, LessonLevel, LessonPlan, LessonPlanOutline, LessonProgressRecord, LessonRecord, LessonStep } from './types'

export const MAX_LESSONS = 12
export const MAX_PLANS = 20
export const MAX_LESSON_CONTENT = 2000
export class LessonValidationError extends Error { constructor(message: string) { super(message); this.name = 'LessonValidationError' } }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new LessonValidationError(`${label} has missing or unexpected fields.`)
}
function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new LessonValidationError(`${label} must be ${min === 0 ? `at most ${max}` : `between ${min} and ${max}`} characters.`)
  return value.trim()
}
function timestamp(value: unknown, label: string): { toMillis(): number } {
  if (!record(value) || typeof value.toMillis !== 'function' || !Number.isFinite((value.toMillis as () => number)())) throw new LessonValidationError(`${label} must be a timestamp.`)
  return value as { toMillis(): number }
}
function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new LessonValidationError(`${label} is invalid.`)
  return value
}
function level(value: unknown): LessonLevel {
  if (value !== 'beginner' && value !== 'intermediate' && value !== 'advanced') throw new LessonValidationError('Lesson level is invalid.')
  return value
}

export function parseOutline(value: unknown, expectedCount?: number): LessonPlanOutline {
  if (!record(value)) throw new LessonValidationError('The lesson outline must be an object.')
  exact(value, ['title', 'lessons'], 'Outline')
  if (!Array.isArray(value.lessons) || value.lessons.length < 3 || value.lessons.length > 10) throw new LessonValidationError('The outline must contain 3 to 10 lessons.')
  if (expectedCount !== undefined && value.lessons.length !== expectedCount) throw new LessonValidationError(`The outline must contain exactly ${expectedCount} lessons.`)
  const ids = new Set<string>()
  const lessons = value.lessons.map((item, index) => {
    if (!record(item)) throw new LessonValidationError(`Outline lesson ${index + 1} is invalid.`)
    exact(item, ['id', 'title', 'objective'], `Outline lesson ${index + 1}`)
    const lessonId = id(item.id, `Outline lesson ${index + 1} id`)
    if (ids.has(lessonId)) throw new LessonValidationError('Outline lesson ids must be unique.')
    ids.add(lessonId)
    return { id: lessonId, title: text(item.title, 'Lesson title', 1, 120), objective: text(item.objective, 'Lesson objective', 1, 300) }
  })
  return { title: text(value.title, 'Plan title', 1, 120), lessons }
}

function parseQuizQuestion(value: unknown, index: number): QuizQuestion {
  if (!record(value)) throw new LessonValidationError(`Quiz question ${index + 1} is invalid.`)
  if (value.kind === 'multiple-choice') {
    exact(value, ['id', 'kind', 'prompt', 'answer', 'options', 'correctIndex', 'explanation'], `Quiz question ${index + 1}`)
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 4 || !value.options.every(option => typeof option === 'string' && option.trim().length > 0 && option.length <= 300)) throw new LessonValidationError(`Quiz question ${index + 1} options are invalid.`)
    if (!Number.isInteger(value.correctIndex) || (value.correctIndex as number) < 0 || (value.correctIndex as number) >= value.options.length || value.options[value.correctIndex as number] !== value.answer) throw new LessonValidationError(`Quiz question ${index + 1} answer index is invalid.`)
    return { id: id(value.id, 'Question id'), kind: 'multiple-choice', prompt: text(value.prompt, 'Quiz prompt', 1, 500), answer: text(value.answer, 'Quiz answer', 1, 600), options: value.options as string[], correctIndex: value.correctIndex as number, explanation: text(value.explanation, 'Quiz explanation', 0, 500) }
  }
  if (value.kind === 'written') {
    exact(value, ['id', 'kind', 'prompt', 'answer', 'explanation'], `Quiz question ${index + 1}`)
    return { id: id(value.id, 'Question id'), kind: 'written', prompt: text(value.prompt, 'Quiz prompt', 1, 500), answer: text(value.answer, 'Quiz answer', 1, 600), explanation: text(value.explanation, 'Quiz explanation', 0, 500) }
  }
  throw new LessonValidationError(`Quiz question ${index + 1} kind is invalid.`)
}

export function parseLesson(value: unknown): LessonRecord
export function parseLesson(value: unknown, lessonId: string): Lesson
export function parseLesson(value: unknown, lessonId?: string): LessonRecord | Lesson {
  if (!record(value)) throw new LessonValidationError('Lesson must be an object.')
  exact(value, ['title', 'objective', 'content', 'keyPoints', 'flashcards', 'quiz', 'updatedAt'], 'Lesson')
  if (!Array.isArray(value.keyPoints) || value.keyPoints.length < 1 || value.keyPoints.length > 6) throw new LessonValidationError('Each lesson needs 1 to 6 key points.')
  if (!Array.isArray(value.flashcards) || value.flashcards.length < 5 || value.flashcards.length > 10) throw new LessonValidationError('Each lesson needs 5 to 10 flashcards.')
  if (!Array.isArray(value.quiz) || value.quiz.length < 3 || value.quiz.length > 6) throw new LessonValidationError('Each lesson needs 3 to 6 quiz questions.')
  const flashcards = value.flashcards.map((card, index): Flashcard => {
    if (!record(card)) throw new LessonValidationError(`Flashcard ${index + 1} is invalid.`)
    exact(card, ['id', 'front', 'back'], `Flashcard ${index + 1}`)
    return { id: id(card.id, 'Flashcard id'), front: text(card.front, 'Flashcard front', 1, 300), back: text(card.back, 'Flashcard back', 1, 600) }
  })
  const quiz = value.quiz.map(parseQuizQuestion)
  return { ...(lessonId ? { id: id(lessonId, 'Lesson id') } : {}), title: text(value.title, 'Lesson title', 1, 120), objective: text(value.objective, 'Lesson objective', 1, 300), content: text(value.content, 'Lesson content', 1, MAX_LESSON_CONTENT), keyPoints: value.keyPoints.map((point, index) => text(point, `Key point ${index + 1}`, 1, 200)), flashcards, quiz, updatedAt: timestamp(value.updatedAt, 'Lesson updatedAt') } as LessonRecord | Lesson
}

export function parseLessonPlan(value: unknown): Omit<LessonPlan, 'id'>
export function parseLessonPlan(value: unknown, planId: string): LessonPlan
export function parseLessonPlan(value: unknown, planId?: string): LessonPlan | Omit<LessonPlan, 'id'> {
  if (!record(value)) throw new LessonValidationError('Lesson plan must be an object.')
  exact(value, ['title', 'topic', 'level', 'lessonCount', 'order', 'createdAt', 'updatedAt', 'status'], 'Lesson plan')
  if (!Array.isArray(value.order) || value.order.length < 1 || value.order.length > MAX_LESSONS) throw new LessonValidationError(`A plan must order 1 to ${MAX_LESSONS} lessons.`)
  const order = value.order.map((entry, index) => id(entry, `Lesson ${index + 1} id`))
  if (new Set(order).size !== order.length || value.lessonCount !== order.length) throw new LessonValidationError('Lesson count and order must agree and contain unique ids.')
  if (value.status !== 'ready' && value.status !== 'partial') throw new LessonValidationError('Lesson plan status is invalid.')
  return { ...(planId ? { id: id(planId, 'Plan id') } : {}), title: text(value.title, 'Plan title', 1, 120), topic: text(value.topic, 'Topic', 1, 500), level: level(value.level), lessonCount: order.length, order, createdAt: timestamp(value.createdAt, 'Plan createdAt'), updatedAt: timestamp(value.updatedAt, 'Plan updatedAt'), status: value.status } as LessonPlan
}

export function parseLessonProgress(value: unknown, allowedIds?: readonly string[]): LessonProgressRecord {
  if (!record(value)) throw new LessonValidationError('Lesson progress must be an object.')
  exact(value, ['version', 'lessons', 'lastLessonId', 'updatedAt'], 'Lesson progress')
  if (value.version !== 1 || !record(value.lessons) || Object.keys(value.lessons).length > MAX_LESSONS) throw new LessonValidationError('Lesson progress has an invalid shape or too many lessons.')
  const lessons: Record<string, LessonCompletion> = {}
  for (const [lessonId, raw] of Object.entries(value.lessons)) {
    id(lessonId, 'Progress lesson id')
    if (allowedIds && !allowedIds.includes(lessonId)) throw new LessonValidationError('Progress contains a lesson outside this plan.')
    if (!record(raw)) throw new LessonValidationError(`Progress for ${lessonId} is invalid.`)
    if (Object.keys(raw).some(key => !['step', 'bestScore', 'completedAt', 'xpAwarded'].includes(key)) || ['step', 'bestScore', 'completedAt'].some(key => !(key in raw))) throw new LessonValidationError(`Progress for ${lessonId} has unexpected fields.`)
    const step = raw.step as LessonStep
    if (!['read', 'practice', 'quiz', 'done'].includes(step) || !Number.isInteger(raw.bestScore) || (raw.bestScore as number) < 0 || (raw.bestScore as number) > 6 || !(raw.completedAt === null || (typeof raw.completedAt === 'number' && Number.isFinite(raw.completedAt))) || (raw.xpAwarded !== undefined && typeof raw.xpAwarded !== 'boolean')) throw new LessonValidationError(`Progress for ${lessonId} is invalid.`)
    // Existing completed lessons predate XP; don't retroactively reward them.
    lessons[lessonId] = { step, bestScore: raw.bestScore as number, completedAt: raw.completedAt as number | null, xpAwarded: raw.xpAwarded === undefined ? raw.completedAt !== null : raw.xpAwarded }
  }
  const last = value.lastLessonId === null ? null : id(value.lastLessonId, 'Last lesson id')
  if (last && allowedIds && !allowedIds.includes(last)) throw new LessonValidationError('Last lesson id is not in this plan.')
  return { version: 1, lessons, lastLessonId: last, updatedAt: timestamp(value.updatedAt, 'Progress updatedAt') }
}
