import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { gradeAttempt } from './grade'
import { normalizeAnswer } from './normalize'
import type { AnswerKey, QuizQuestion } from '../types'

const questions: QuizQuestion[] = [
  { type: 'multiple_choice', order: 0, prompt: 'Choose', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
  { type: 'true_false', order: 1, prompt: 'True?', points: 1, options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }] },
  { type: 'identification', order: 2, prompt: 'Name it', points: 3 },
  { type: 'fill_blank', order: 3, prompt: 'Fill', points: 4 },
  { type: 'flashcard', order: 4, prompt: 'Front', points: 5 },
]
const keys: Record<string, AnswerKey> = {
  q0: { type: 'choice', correctOptionId: 'b', explanation: '', caseSensitive: false },
  q1: { type: 'choice', correctOptionId: 'f', explanation: '', caseSensitive: false },
  q2: { type: 'identification', acceptedAnswers: ['New York', 'NYC'], explanation: '', caseSensitive: false },
  q3: { type: 'fill_blank', blanks: [['alpha'], ['beta']], explanation: '', caseSensitive: false },
  q4: { type: 'flashcard', back: 'Back', explanation: '', caseSensitive: false },
}
const mappedQuestions = questions.map((question, index) => ({ ...question, id: `q${index}` })) as (QuizQuestion & { id: string })[]

describe('calculateGrade', () => {
  it('grades all question types with case and whitespace normalization and excludes flashcards', () => {
    const grade = gradeAttempt({ userId: 'student', questions: mappedQuestions, answerKeys: keys, answers: { q0: 'b', q1: 'f', q2: '  NEW   YORK ', q3: ['ALPHA', 'beta'] }, gradedAt: Timestamp.now() })
    expect(grade.score).toBe(10)
    expect(grade.maxScore).toBe(10)
    expect(grade.perQuestion.q4).toEqual({ correct: null, pointsAwarded: 0, overridden: false })
  })

  it('awards partial blank credit and marks the question incorrect', () => {
    const grade = gradeAttempt({ userId: 'student', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha', 'wrong'] }, gradedAt: Timestamp.now() })
    expect(grade.perQuestion.q3).toEqual({ correct: false, pointsAwarded: 2, overridden: false })
  })

  it('requires every fill blank and rejects extra answers', () => {
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha'] }, gradedAt: Timestamp.now() }).perQuestion.q3.correct).toBe(false)
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha', 'beta', 'extra'] }, gradedAt: Timestamp.now() }).perQuestion.q3.pointsAwarded).toBe(4)
  })

  it('respects caseSensitive and never accepts a wrong or absent option id', () => {
    const sensitive = { ...keys, q2: { ...keys.q2, caseSensitive: true } as AnswerKey }
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: sensitive, answers: { q2: 'new york', q0: 'A' }, gradedAt: Timestamp.now() }).perQuestion.q2.correct).toBe(false)
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: {}, gradedAt: Timestamp.now() }).perQuestion.q0.pointsAwarded).toBe(0)
  })

  it('fails clearly when a graded question has no answer key', () => {
    expect(() => gradeAttempt({ userId: 's', questions: [mappedQuestions[0]], answerKeys: {}, answers: {}, gradedAt: Timestamp.now() })).toThrow('Missing answer key')
  })

  it.each([
    { points: 1, blankCount: 6, expectedPoints: 1 },
    { points: 2, blankCount: 7, expectedPoints: 2 },
    { points: 7, blankCount: 6, expectedPoints: 7 },
    { points: 12, blankCount: 7, expectedPoints: 12 },
  ])('correctly grades points: $points, blanks: $blankCount without float inaccuracy', ({ points, blankCount, expectedPoints }) => {
    const blanks = Array.from({ length: blankCount }, (_, i) => [`ans${i}`])
    const question: QuizQuestion & { id: string } = {
      id: 'fb',
      type: 'fill_blank',
      order: 0,
      prompt: 'Fill blanks',
      points,
    }
    const key: Record<string, AnswerKey> = {
      fb: { type: 'fill_blank', blanks, explanation: '', caseSensitive: false },
    }
    const fullAnswers = Array.from({ length: blankCount }, (_, i) => `ans${i}`)
    const fullGrade = gradeAttempt({
      userId: 's',
      questions: [question],
      answerKeys: key,
      answers: { fb: fullAnswers },
      gradedAt: Timestamp.now(),
    })
    expect(fullGrade.perQuestion.fb.correct).toBe(true)
    expect(fullGrade.perQuestion.fb.pointsAwarded).toBe(expectedPoints)
    expect(fullGrade.score).toBe(expectedPoints)

    // Partial answer: only 1 blank correct
    const partialAnswers = [`ans0`, ...Array.from({ length: blankCount - 1 }, () => 'wrong')]
    const partialGrade = gradeAttempt({
      userId: 's',
      questions: [question],
      answerKeys: key,
      answers: { fb: partialAnswers },
      gradedAt: Timestamp.now(),
    })
    expect(partialGrade.perQuestion.fb.correct).toBe(false)
    expect(partialGrade.perQuestion.fb.pointsAwarded).toBe(Math.round((1 / blankCount) * points * 100) / 100)
  })
})


describe('normalizeAnswer', () => {
  it('normalizes Unicode strings to NFC', () => {
    // 'e\u0301' is decomposed (NFD), '\u00e9' is composed (NFC)
    const decomposed = 'caf\u0065\u0301'
    const composed = 'caf\u00e9'
    expect(decomposed).not.toBe(composed)
    expect(normalizeAnswer(decomposed, true)).toBe(normalizeAnswer(composed, true))
    expect(normalizeAnswer(decomposed, false)).toBe('café')
  })

  it('supports optional ignoreDiacritics and ignorePunctuation', () => {
    expect(normalizeAnswer('Crème brûlée!', false, { ignoreDiacritics: true, ignorePunctuation: true })).toBe('creme brulee')
    expect(normalizeAnswer('Hello, World!', false, { ignorePunctuation: true })).toBe('hello world')
  })
})
