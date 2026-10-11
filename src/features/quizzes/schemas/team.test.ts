import { describe, expect, it } from 'vitest'
import { parseReveal, parseSession, parseTeam, TeamDataError } from './team'

const team = { name: 'Owls', memberIds: ['a', 'b'], memberNames: { a: 'Ada', b: 'Bo' }, representativeId: 'a', status: 'ready' }
const session = { phase: 'answering', currentIndex: 0, total: 3 }
const reveal = { index: 1, questionId: 'q1', question: { type: 'multiple_choice', prompt: 'P', points: 2, options: [{ id: 'o1', text: 'One' }] }, picks: { a: 'o1' } }

describe('parseTeam', () => {
  it('parses a team and fills safe defaults', () => {
    expect(parseTeam(team, 't1')).toEqual({
      id: 't1', name: 'Owls', memberIds: ['a', 'b'], memberNames: { a: 'Ada', b: 'Bo' }, representativeId: 'a', code: null, studyGroupId: null, status: 'ready', score: null, maxScore: null,
    })
  })
  it('keeps code, study group and score when present', () => {
    expect(parseTeam({ ...team, code: 'ABC234', studyGroupId: 'g1', status: 'submitted', score: 4, maxScore: 5 }, 't1')).toMatchObject({ code: 'ABC234', studyGroupId: 'g1', score: 4, maxScore: 5 })
  })
  it('replaces a non-text member name with a placeholder', () => {
    expect(parseTeam({ ...team, memberNames: { a: 7 } }, 't1').memberNames).toEqual({ a: 'Student' })
  })
  it('returns names as plain text and never interprets markup', () => {
    expect(parseTeam({ ...team, name: '<img src=x onerror=alert(1)>' }, 't1').name).toBe('<img src=x onerror=alert(1)>')
  })
  it.each([
    ['not an object', 'nope'], ['array', []], ['null', null],
    ['unknown status', { ...team, status: 'bogus' }], ['missing name', { ...team, name: undefined }],
    ['members not text', { ...team, memberIds: [1] }], ['missing representative', { ...team, representativeId: undefined }],
    ['score as text', { ...team, score: '4' }],
  ])('rejects damaged data: %s', (_label, value) => {
    expect(() => parseTeam(value, 't1')).toThrow(TeamDataError)
  })
})

describe('parseSession', () => {
  it('parses a minimal session with empty collections', () => {
    expect(parseSession(session)).toEqual({
      phase: 'answering', currentIndex: 0, total: 3, questionStartedAt: null, questionEndsAt: null, reviewStartedAt: null, question: null, answered: {}, picks: null, locked: false, ready: {},
    })
  })
  it('parses the current question and timer', () => {
    const parsed = parseSession({ ...session, questionStartedAt: 1000, questionEndsAt: 31000, question: { id: 'q1', index: 0, type: 'multiple_choice', prompt: 'P', points: 1, options: [{ id: 'o1', text: 'One' }] } })
    expect(parsed.questionEndsAt).toBe(31000)
    expect(parsed.question?.options).toEqual([{ id: 'o1', text: 'One' }])
  })
  it('keeps only true flags for answered and ready', () => {
    const parsed = parseSession({ ...session, answered: { a: true, b: false, c: 'yes' }, ready: { a: true } })
    expect(parsed.answered).toEqual({ a: true })
    expect(parsed.ready).toEqual({ a: true })
  })
  it('parses picks once they are revealed', () => {
    expect(parseSession({ ...session, picks: { a: 'o1', b: ['x', 'y'] } }).picks).toEqual({ a: 'o1', b: ['x', 'y'] })
  })
  it('treats only a literal true as locked', () => {
    expect(parseSession({ ...session, locked: true }).locked).toBe(true)
    expect(parseSession({ ...session, locked: 'true' }).locked).toBe(false)
  })
  it.each([
    ['unknown phase', { ...session, phase: 'paused' }], ['fraction index', { ...session, currentIndex: 1.5 }], ['missing total', { ...session, total: undefined }],
    ['bad option', { ...session, question: { id: 'q', index: 0, type: 't', prompt: 'P', points: 1, options: [{ id: 1, text: 'x' }] } }],
    ['picks not an object', { ...session, picks: 'x' }], ['non-number time', { ...session, questionEndsAt: 'soon' }],
  ])('rejects damaged data: %s', (_label, value) => {
    expect(() => parseSession(value)).toThrow(TeamDataError)
  })
})

describe('parseReveal', () => {
  it('parses a reveal with no result yet', () => {
    expect(parseReveal(reveal)).toMatchObject({ index: 1, questionId: 'q1', finalAnswer: null, lockedBy: null, auto: false, result: null, picks: { a: 'o1' } })
  })
  it('parses the graded result once answers are revealed', () => {
    const parsed = parseReveal({ ...reveal, finalAnswer: 'o1', lockedBy: 'a', auto: true, result: { correct: true, pointsAwarded: 2, correctAnswer: 'o1', explanation: 'Because.' } })
    expect(parsed.result).toEqual({ correct: true, pointsAwarded: 2, correctAnswer: 'o1', explanation: 'Because.' })
    expect(parsed.auto).toBe(true)
  })
  it('keeps a list answer for fill-in-the-blank', () => {
    expect(parseReveal({ ...reveal, finalAnswer: ['x', 'y'] }).finalAnswer).toEqual(['x', 'y'])
  })
  it.each([
    ['missing index', { ...reveal, index: undefined }], ['no question', { ...reveal, question: undefined }],
    ['result without verdict', { ...reveal, result: { pointsAwarded: 1, correctAnswer: 'o1' } }], ['numeric answer', { ...reveal, finalAnswer: 3 }],
  ])('rejects damaged data: %s', (_label, value) => {
    expect(() => parseReveal(value)).toThrow(TeamDataError)
  })
})
