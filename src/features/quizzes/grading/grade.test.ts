import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { gradeAttempt } from './grade'
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
})
