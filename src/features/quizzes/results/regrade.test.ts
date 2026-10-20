import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { AnswerKey, QuizAttempt, QuizQuestion, QuizResult } from '../types'
import { regradeAutomaticAttempt } from './resultLogic'

const question = { order: 0, type: 'identification', prompt: 'Name the error', points: 2 } as QuizQuestion
const questions = [{ ...question, id: 'q1' }]
const key = (acceptedAnswers: string[]): AnswerKey => ({ type: 'identification', acceptedAnswers, explanation: '', caseSensitive: false })
const attempt = { userId: 'u1', answers: { q1: 'Syntax error' }, status: 'submitted' } as unknown as QuizAttempt
const staleResult = (overridden = false): QuizResult => ({
  userId: 'u1', score: 0, maxScore: 2, gradedAt: Timestamp.now(),
  perQuestion: { q1: { correct: false, pointsAwarded: 0, overridden } },
})

describe('regradeAutomaticAttempt', () => {
  it('fixes a stale wrong grade once the answer key accepts the answer', () => {
    const next = regradeAutomaticAttempt({ result: staleResult(), questions, answerKeys: { q1: key(['Syntax error']) }, attempt })
    expect(next?.score).toBe(2)
    expect(next?.perQuestion.q1).toEqual({ correct: true, pointsAwarded: 2, overridden: false })
  })

  it('returns null when the stored grade already matches the key', () => {
    expect(regradeAutomaticAttempt({ result: staleResult(), questions, answerKeys: { q1: key(['Something else']) }, attempt })).toBeNull()
  })

  it('keeps grades an instructor overrode by hand', () => {
    expect(regradeAutomaticAttempt({ result: staleResult(true), questions, answerKeys: { q1: key(['Syntax error']) }, attempt })).toBeNull()
  })
})
