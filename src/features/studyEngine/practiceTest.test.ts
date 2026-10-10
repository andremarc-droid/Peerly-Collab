import { describe, expect, it } from 'vitest'
import { isTimeUp, parseQuestion, parseTestAttempt, remainingSeconds, scoreTest } from './practiceTest'
import type { QuizQuestion } from './quiz'

const written: QuizQuestion = { id: 'q', kind: 'written', prompt: 'prompt', answer: 'answer', explanation: 'explain' }
const choice: QuizQuestion = { id: 'choice', kind: 'multiple-choice', prompt: 'prompt', answer: 'answer', explanation: 'explain', options: ['answer', 'wrong'], correctIndex: 0 }

describe('remainingSeconds', () => {
  it('returns null for an untimed test', () => {
    expect(remainingSeconds(1_000, null, 100_000)).toBeNull()
  })
  it('counts down and clamps after the limit', () => {
    expect(remainingSeconds(1_000, 10, 9_000)).toBe(2)
    expect(remainingSeconds(1_000, 10, 20_000)).toBe(0)
  })
  it('reports time-up at and after expiry only', () => {
    expect(isTimeUp(1_000, 10, 10_999)).toBe(false)
    expect(isTimeUp(1_000, 10, 11_000)).toBe(true)
    expect(isTimeUp(1_000, null, 99_000)).toBe(false)
  })
})

describe('scoreTest', () => {
  it('scores a correct choice and wrong blank as expected', () => {
    const attempt = scoreTest([choice, written], [0, null], ['correct', 'incorrect'], 'c~d', 50, 0)
    expect(attempt).toMatchObject({ score: 1, maxScore: 2, startedAt: 0, createdAt: 50, durationSeconds: 0 })
    expect(attempt.review.map(row => row.correct)).toEqual([true, false])
  })
  it('leaves AI-unsure written answers awaiting self-grade', () => {
    const attempt = scoreTest([written], ['maybe'], ['unsure'], 'c~d', 50, 10, 300)
    expect(attempt.review[0]?.correct).toBeNull()
    expect(attempt.timeLimitSeconds).toBe(300)
  })
  it('caps serialized reviews at fifty questions', () => {
    const questions = Array.from({ length: 51 }, (_, index) => ({ ...written, id: `q${index}` }))
    const attempt = scoreTest(questions, [], [], 'c~d', 0)
    expect(attempt.review).toHaveLength(50)
  })
})

describe('parseQuestion', () => {
  it('parses written questions', () => {
    expect(parseQuestion(written)).toEqual(written)
  })
  it('parses multiple-choice questions with two to six options', () => {
    expect(parseQuestion(choice)?.options).toEqual(['answer', 'wrong'])
    expect(parseQuestion({ ...choice, options: Array.from({ length: 6 }, (_, i) => `o${i}`), correctIndex: 0 })).not.toBeNull()
  })
  it('rejects missing and invalid question shapes', () => {
    expect(parseQuestion(null)).toBeNull()
    expect(parseQuestion({ id: 'q', prompt: '', answer: '', kind: 'other' })).toBeNull()
  })
  it('caps prompt length at 300 characters', () => {
    expect(parseQuestion({ ...written, prompt: 'p'.repeat(301) })).toBeNull()
  })
  it('caps answer length at 600 characters', () => {
    expect(parseQuestion({ ...written, answer: 'a'.repeat(601) })).toBeNull()
  })
  it('caps explanation length at 400 characters', () => {
    expect(parseQuestion({ ...written, explanation: 'e'.repeat(401) })).toBeNull()
  })
  it('caps option text at 300 characters', () => {
    expect(parseQuestion({ ...choice, options: ['x'.repeat(301), 'answer'] })).toBeNull()
  })
  it('rejects fewer than two or more than six options', () => {
    expect(parseQuestion({ ...choice, options: ['one'] })).toBeNull()
    expect(parseQuestion({ ...choice, options: Array.from({ length: 7 }, (_, i) => `${i}`) })).toBeNull()
  })
})

describe('parseTestAttempt', () => {
  it('parses valid attempt metadata and review', () => {
    const attempt = scoreTest([written], ['answer'], ['correct'], 'c~d', 100, 10, null)
    expect(parseTestAttempt(attempt)).toEqual(attempt)
  })
  it('rejects malformed data and review size mismatches', () => {
    const attempt = scoreTest([written], ['answer'], ['correct'], 'c~d', 100, 10)
    expect(parseTestAttempt({})).toBeNull()
    expect(parseTestAttempt({ ...attempt, review: [] })).toBeNull()
  })
  it('rejects duration below zero or a time limit above three hours', () => {
    const attempt = scoreTest([], [], [], 'c~d', 100, 10)
    expect(parseTestAttempt({ ...attempt, durationSeconds: -1 })).toBeNull()
    expect(parseTestAttempt({ ...attempt, timeLimitSeconds: 10_801 })).toBeNull()
  })
})
