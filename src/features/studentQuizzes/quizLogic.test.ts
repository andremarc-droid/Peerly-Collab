import { describe, expect, it } from 'vitest'
import { createQuestionOrder, optionOrderForQuestion, remainingAttempts, remainingSeconds, resultVisibility, shouldAutoSubmit } from './quizLogic'
import type { Quiz, QuizAttempt, QuizResult } from '../quizzes/types'
import { Timestamp } from 'firebase/firestore'

const quiz = (overrides: Partial<Quiz['settings']> = {}): Quiz => ({
  ownerId: 'teacher', ownerName: 'Teacher', classId: 'class', title: 'Practice', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 2,
  createdAt: Timestamp.now(), updatedAt: Timestamp.now(), publishedAt: Timestamp.now(),
  settings: { answerReveal: 'after_submit', participation: { type: 'individual' }, scoreVisibility: 'immediate', scoresReleased: false, timeLimitMinutes: 1, attemptsAllowed: 2, shuffleQuestions: true, shuffleOptions: true, ...overrides },
})
const attempt: QuizAttempt = { userId: 'student', userName: 'Student', attemptNumber: 1, status: 'in_progress', answers: {}, questionOrder: ['b', 'a'], optionOrder: { a: ['o2', 'o1'] }, startedAt: Timestamp.now(), submittedAt: null, timeSpentSeconds: 0 }
const result: QuizResult = { userId: 'student', score: 1, maxScore: 2, perQuestion: { a: { correct: true, pointsAwarded: 1, overridden: false } }, gradedAt: Timestamp.now() }

describe('student quiz logic', () => {
  it('counts down accurately and signals automatic submission at zero', () => {
    expect(remainingSeconds(0, 1, 30_000)).toBe(30)
    expect(remainingSeconds(0, 1, 60_001)).toBe(0)
    expect(shouldAutoSubmit(0)).toBe(true)
    expect(shouldAutoSubmit(1)).toBe(false)
  })

  it('preserves attempt question and option order instead of reshuffling on resume', () => {
    expect(createQuestionOrder(['a', 'b', 'c'], false)).toEqual(['a', 'b', 'c'])
    expect(createQuestionOrder(['a', 'b', 'c'], true, () => 0)).toEqual(['b', 'c', 'a'])
    expect(attempt.questionOrder).toEqual(['b', 'a'])
    expect(optionOrderForQuestion('a', attempt, { id: 'a', order: 0, prompt: 'pick', points: 1, type: 'multiple_choice', options: [{ id: 'o1', text: 'one' }, { id: 'o2', text: 'two' }] })).toEqual(['o2', 'o1'])
  })

  it('hides unreleased and hidden scores, and never exposes answers when reveal is never', () => {
    expect(resultVisibility(quiz({ scoreVisibility: 'after_release' }), 'after_submit', result)).toEqual({ showScore: false, showAnswers: true })
    expect(resultVisibility(quiz({ scoreVisibility: 'hidden' }), 'never', result)).toEqual({ showScore: false, showAnswers: false })
    expect(resultVisibility(quiz({ scoresReleased: true, scoreVisibility: 'after_release' }), 'after_submit', result).showScore).toBe(true)
  })

  it('enforces remaining attempt counts and supports unlimited attempts', () => {
    expect(remainingAttempts(quiz(), 1)).toBe(1)
    expect(remainingAttempts(quiz(), 2)).toBe(0)
    expect(remainingAttempts(quiz({ attemptsAllowed: null }), 99)).toBeNull()
  })
})
