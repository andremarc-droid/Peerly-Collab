import { describe, expect, it } from 'vitest'
import { LessonValidationError, parseLesson, parseLessonPlan, parseLessonProgress, parseOutline } from './schemas'

const stamp = { toMillis: () => 123 }
const cards = Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, front: 'Question', back: 'Answer' }))
const quiz = Array.from({ length: 3 }, (_, index) => ({ id: `q${index}`, kind: 'multiple-choice', prompt: 'Choose', answer: 'A', options: ['A', 'B'], correctIndex: 0, explanation: 'Because.' }))
const lesson = { title: 'Lesson', objective: 'Learn', content: '## A short lesson', keyPoints: ['Key point'], flashcards: cards, quiz, updatedAt: stamp }
const plan = { title: 'Plan', topic: 'Topic', level: 'beginner', lessonCount: 3, order: ['one', 'two', 'three'], createdAt: stamp, updatedAt: stamp, status: 'ready' }

describe('lesson schemas', () => {
  it('accepts valid outlines, lessons, plans and progress', () => {
    expect(parseOutline({ title: 'Plan', lessons: plan.order.map(id => ({ id, title: 'Lesson', objective: 'Learn' })) }).lessons).toHaveLength(3)
    expect(parseLesson(lesson)).toMatchObject({ title: 'Lesson', flashcards: cards, quiz })
    expect(parseLessonPlan(plan).lessonCount).toBe(3)
    expect(parseLessonProgress({ version: 1, lessons: { one: { step: 'read', bestScore: 0, completedAt: null } }, lastLessonId: 'one', updatedAt: stamp }, plan.order).lessons.one?.step).toBe('read')
  })
  it('rejects extra and malformed fields', () => {
    expect(() => parseLesson({ ...lesson, script: 'bad' })).toThrow(LessonValidationError)
    expect(() => parseLessonPlan({ ...plan, level: 'expert' })).toThrow(/level/)
    expect(() => parseOutline({ title: 'Plan', lessons: [] })).toThrow(/3 to 10/)
    expect(() => parseLessonProgress({ version: 1, lessons: {}, lastLessonId: null, updatedAt: stamp, extra: 1 })).toThrow(/unexpected fields/)
  })
  it('rejects content, point, card and option lengths outside limits', () => {
    expect(() => parseLesson({ ...lesson, content: 'x'.repeat(2001) })).toThrow(/content/)
    expect(() => parseLesson({ ...lesson, keyPoints: ['x'.repeat(201)] })).toThrow(/Key point/)
    expect(() => parseLesson({ ...lesson, flashcards: [{ ...cards[0], front: 'x'.repeat(301) }, ...cards.slice(1)] })).toThrow(/front/)
    expect(() => parseLesson({ ...lesson, quiz: [{ ...quiz[0], correctIndex: 1 }, ...quiz.slice(1)] })).toThrow(/answer index/)
  })
})
