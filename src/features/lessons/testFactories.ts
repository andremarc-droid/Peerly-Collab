import type { Lesson, LessonPlan, LessonProgressRecord } from './types'

export const testTimestamp = { toMillis: () => 1_000 }
export function makePlan(overrides: Partial<LessonPlan> = {}): LessonPlan {
  return { id: 'plan-a', title: 'Cell biology', topic: 'Cells', level: 'beginner', lessonCount: 3, order: ['lesson-1', 'lesson-2', 'lesson-3'], createdAt: testTimestamp, updatedAt: testTimestamp, status: 'ready', ...overrides }
}
export function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return { id: 'lesson-1', title: 'Cell structure', objective: 'Identify cell structures', content: 'Cells are the basic units of life.', keyPoints: ['Cells contain structures.'], flashcards: Array.from({ length: 5 }, (_, index) => ({ id: `card-${index}`, front: `Question ${index}`, back: `Answer ${index}` })), quiz: Array.from({ length: 3 }, (_, index) => ({ id: `question-${index}`, kind: 'multiple-choice', prompt: 'What is a cell?', answer: 'Basic unit', options: ['Basic unit', 'A planet'], correctIndex: 0, explanation: 'Cells are the basic unit.' })), updatedAt: testTimestamp, ...overrides } as Lesson
}
export function makeProgress(overrides: Partial<LessonProgressRecord> = {}): LessonProgressRecord {
  return { version: 1, lessons: {}, lastLessonId: null, updatedAt: testTimestamp, ...overrides }
}
