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

  it('applies the full score visibility and answer reveal matrix', () => {
    const scoreSettings = ['immediate', 'after_release', 'hidden'] as const
    const revealSettings = ['after_each', 'after_submit', 'never'] as const
    for (const scoreVisibility of scoreSettings) {
      for (const answerReveal of revealSettings) {
        const matrixQuiz = quiz({ scoreVisibility, answerReveal, scoresReleased: false })
        const actual = resultVisibility(matrixQuiz, answerReveal, result)
        const expectedScore = scoreVisibility === 'immediate'
        expect(actual.showScore).toBe(expectedScore)
        // Answers are only readable/shown when result is accessible (showScore is true) and reveal !== 'never'
        expect(actual.showAnswers).toBe(expectedScore && answerReveal !== 'never')
      }
    }
    // When released, after_release becomes visible
    for (const answerReveal of revealSettings) {
      const releasedQuiz = quiz({ scoreVisibility: 'after_release', scoresReleased: true })
      const actual = resultVisibility(releasedQuiz, answerReveal, result)
      expect(actual.showScore).toBe(true)
      expect(actual.showAnswers).toBe(answerReveal !== 'never')
    }
    // When result is null, showAnswers is always false
    for (const scoreVisibility of scoreSettings) {
      for (const answerReveal of revealSettings) {
        const nullResultQuiz = quiz({ scoreVisibility, answerReveal, scoresReleased: true })
        const actual = resultVisibility(nullResultQuiz, answerReveal, null)
        expect(actual.showAnswers).toBe(false)
      }
    }
  })

  it('enforces remaining attempt counts and supports unlimited attempts', () => {
    expect(remainingAttempts(quiz(), 1)).toBe(1)
    expect(remainingAttempts(quiz(), 2)).toBe(0)
    expect(remainingAttempts(quiz({ attemptsAllowed: null }), 99)).toBeNull()
  })
})
