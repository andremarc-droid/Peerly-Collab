import { describe, expect, it } from 'vitest'
import { GroupQuizError } from './groupQuizLogic'
import { gradeQuestion, gradeTeam, normalizeAnswer, type GradableKey, type GradableQuestion } from './groupQuizGrading'

const mc: GradableQuestion = { id: 'q1', type: 'multiple_choice', points: 2 }
const tf: GradableQuestion = { id: 'q2', type: 'true_false', points: 1 }
const ident: GradableQuestion = { id: 'q3', type: 'identification', points: 3 }
const blanks: GradableQuestion = { id: 'q4', type: 'fill_blank', points: 4 }

const choiceKey: GradableKey = { type: 'choice', correctOptionId: 'b', explanation: '', caseSensitive: false }
const identKey: GradableKey = { type: 'identification', acceptedAnswers: ['Paris', 'City of Light'], explanation: '', caseSensitive: false }
const blankKey: GradableKey = { type: 'fill_blank', blanks: [['red', 'crimson'], ['blue']], explanation: '', caseSensitive: false }

describe('normalizeAnswer', () => {
  it('trims, collapses whitespace and lowercases unless case sensitive', () => {
    expect(normalizeAnswer('  Hello   World ', false)).toBe('hello world')
    expect(normalizeAnswer('  Hello   World ', true)).toBe('Hello World')
  })
})

describe('gradeQuestion', () => {
  it('multiple choice and true/false compare option ids', () => {
    expect(gradeQuestion(mc, choiceKey, 'b')).toEqual({ correct: true, pointsAwarded: 2, overridden: false })
    expect(gradeQuestion(mc, choiceKey, 'a')).toEqual({ correct: false, pointsAwarded: 0, overridden: false })
    expect(gradeQuestion(tf, choiceKey, 'b').pointsAwarded).toBe(1)
    expect(gradeQuestion(mc, choiceKey, ['b']).correct).toBe(false)
  })
  it('no answer earns nothing', () => {
    for (const [question, key] of [[mc, choiceKey], [ident, identKey], [blanks, blankKey]] as const) {
      expect(gradeQuestion(question, key, undefined)).toEqual({ correct: false, pointsAwarded: 0, overridden: false })
    }
  })
  it('identification accepts any normalized alternative', () => {
    expect(gradeQuestion(ident, identKey, '  paris ').correct).toBe(true)
    expect(gradeQuestion(ident, identKey, 'CITY   OF light').pointsAwarded).toBe(3)
    expect(gradeQuestion(ident, identKey, 'London').correct).toBe(false)
    expect(gradeQuestion(ident, identKey, ['Paris']).correct).toBe(false)
  })
  it('identification honors case sensitivity', () => {
    const strict: GradableKey = { ...identKey, caseSensitive: true } as GradableKey
    expect(gradeQuestion(ident, strict, 'Paris').correct).toBe(true)
    expect(gradeQuestion(ident, strict, 'paris').correct).toBe(false)
  })
  it('fill in the blank gives an equal share per blank', () => {
    expect(gradeQuestion(blanks, blankKey, ['red', 'blue'])).toEqual({ correct: true, pointsAwarded: 4, overridden: false })
    expect(gradeQuestion(blanks, blankKey, ['Crimson', 'green'])).toEqual({ correct: false, pointsAwarded: 2, overridden: false })
    expect(gradeQuestion(blanks, blankKey, ['x', 'y'])).toEqual({ correct: false, pointsAwarded: 0, overridden: false })
  })
  it('fill in the blank tolerates short or missing entries without crashing', () => {
    expect(gradeQuestion(blanks, blankKey, ['red']).pointsAwarded).toBe(2)
    expect(gradeQuestion(blanks, blankKey, ['red']).correct).toBe(false)
    expect(gradeQuestion(blanks, blankKey, 'red').pointsAwarded).toBe(2)
  })
  it('a mismatched key type is a failed-precondition error, not a silent zero', () => {
    for (const [question, key] of [[mc, identKey], [ident, choiceKey], [blanks, choiceKey]] as const) {
      try { gradeQuestion(question, key, 'x'); expect.unreachable() } catch (error) {
        expect(error).toBeInstanceOf(GroupQuizError)
        expect((error as GroupQuizError).code).toBe('failed-precondition')
      }
    }
  })
})

describe('gradeTeam', () => {
  const questions = [mc, tf, ident, blanks]
  const keys: Record<string, GradableKey> = { q1: choiceKey, q2: choiceKey, q3: identKey, q4: blankKey }
  it('sums points, reports the maximum and keeps a per-question breakdown', () => {
    const result = gradeTeam(questions, keys, { q1: 'b', q2: 'a', q3: 'paris', q4: ['red', 'x'] })
    expect(result.maxScore).toBe(10)
    expect(result.score).toBe(7)
    expect(result.perQuestion.q1?.correct).toBe(true)
    expect(result.perQuestion.q2?.correct).toBe(false)
    expect(result.perQuestion.q4?.pointsAwarded).toBe(2)
  })
  it('scores unanswered questions as zero', () => {
    const result = gradeTeam(questions, keys, {})
    expect(result.score).toBe(0)
    expect(result.maxScore).toBe(10)
    expect(Object.keys(result.perQuestion)).toEqual(['q1', 'q2', 'q3', 'q4'])
  })
  it('ignores answers for questions that are not in the quiz', () => {
    expect(gradeTeam([mc], { q1: choiceKey }, { q1: 'b', ghost: 'b' }).score).toBe(2)
  })
  it('rounds to two decimals', () => {
    const thirds: GradableQuestion = { id: 't', type: 'fill_blank', points: 1 }
    const key: GradableKey = { type: 'fill_blank', blanks: [['a'], ['b'], ['c']], explanation: '', caseSensitive: false }
    expect(gradeTeam([thirds], { t: key }, { t: ['a', 'x', 'x'] }).score).toBe(0.33)
  })
  it('fails when a question has no answer key', () => {
    try { gradeTeam([mc, tf], { q1: choiceKey }, {}); expect.unreachable() } catch (error) {
      expect((error as GroupQuizError).code).toBe('failed-precondition')
    }
  })
})
