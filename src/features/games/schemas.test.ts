import { describe, expect, it } from 'vitest'
import { GameDataError, answeredCount, cleanDisplayName, normalizeGameCode, parseCurrentQuestion, parseGame, parsePlayer, parseReveal, rankPlayers, secondsLeft, validateJoinInput } from './schemas'

const ts = (ms: number) => ({ toMillis: () => ms })
const game = {
  hostId: 'host', groupId: null, code: 'ABC234', status: 'lobby', questionIndex: 0, questionCount: 5,
  questionStartedAt: null, questionEndsAt: null, settings: { timeLimitSec: 20 }, playerCount: 2, createdAt: ts(1), expiresAt: ts(99),
}

describe('parseGame', () => {
  it('parses a valid game document', () => {
    const parsed = parseGame(game, 'g1')
    expect(parsed).toMatchObject({ id: 'g1', hostId: 'host', code: 'ABC234', status: 'lobby', timeLimitSec: 20, playerCount: 2, expiresAtMs: 99, questionEndsAtMs: null })
  })
  it('reads server timestamps for the question window', () => {
    expect(parseGame({ ...game, status: 'question', questionStartedAt: ts(10), questionEndsAt: ts(30_010) }, 'g1')).toMatchObject({ questionStartedAtMs: 10, questionEndsAtMs: 30_010 })
  })
  it('rejects malformed games', () => {
    for (const bad of [null, [], { ...game, status: 'weird' }, { ...game, code: 'abc' }, { ...game, code: 'ABCDE0' }, { ...game, questionCount: 2 }, { ...game, settings: { timeLimitSec: 5 } }, { ...game, expiresAt: 'soon' }, { ...game, hostId: '' }]) {
      expect(() => parseGame(bad, 'g1')).toThrow(GameDataError)
    }
  })
})

describe('parseCurrentQuestion', () => {
  const current = { questionIndex: 1, prompt: 'Capital?', options: ['A', 'B'], startedAt: ts(1), endsAt: ts(2) }
  it('parses the open question, which has no answer field', () => {
    const parsed = parseCurrentQuestion(current)
    expect(parsed.options).toEqual(['A', 'B'])
    expect('correctIndex' in parsed).toBe(false)
  })
  it('rejects bad option lists and missing timing', () => {
    expect(() => parseCurrentQuestion({ ...current, options: ['only'] })).toThrow(GameDataError)
    expect(() => parseCurrentQuestion({ ...current, options: ['a', 'b', 'c', 'd', 'e'] })).toThrow(GameDataError)
    expect(() => parseCurrentQuestion({ ...current, options: ['a', 3] })).toThrow(GameDataError)
    expect(() => parseCurrentQuestion({ ...current, endsAt: null })).toThrow(GameDataError)
  })
})

describe('parseReveal and parsePlayer', () => {
  it('parses a reveal and rejects impossible points', () => {
    expect(parseReveal({ questionIndex: 0, correctOptionIndex: 2, perPlayerPoints: { a: 1500, b: 0 } }).perPlayerPoints.a).toBe(1500)
    expect(() => parseReveal({ questionIndex: 0, correctOptionIndex: 2, perPlayerPoints: { a: 99999 } })).toThrow(GameDataError)
    expect(() => parseReveal({ questionIndex: 0, correctOptionIndex: 9, perPlayerPoints: {} })).toThrow(GameDataError)
  })
  it('parses a player and treats a missing answeredIndex as null', () => {
    expect(parsePlayer({ displayName: 'Ana', score: 10 }, 'u1')).toEqual({ uid: 'u1', displayName: 'Ana', score: 10, answeredIndex: null })
    expect(() => parsePlayer({ displayName: '', score: 0 }, 'u1')).toThrow(GameDataError)
    expect(() => parsePlayer({ displayName: 'x', score: -1 }, 'u1')).toThrow(GameDataError)
  })
})

describe('join input', () => {
  it('normalizes the code and cleans the name', () => {
    expect(normalizeGameCode(' abc-234 ')).toBe('ABC234')
    expect(cleanDisplayName('  Ana\n  Cruz ')).toBe('Ana Cruz')
    expect(validateJoinInput('abc 234', ' Ana ')).toEqual({ code: 'ABC234', displayName: 'Ana' })
  })
  it('explains invalid input', () => {
    expect(validateJoinInput('ABC', 'Ana')).toHaveProperty('error')
    expect(validateJoinInput('ABC234', '   ')).toHaveProperty('error')
    expect(validateJoinInput('ABC234', 'x'.repeat(31))).toHaveProperty('error')
  })
})

describe('ranking and timers', () => {
  const players = [
    { uid: 'c', displayName: 'Cy', score: 500, answeredIndex: 1 },
    { uid: 'a', displayName: 'Ana', score: 1500, answeredIndex: 1 },
    { uid: 'b', displayName: 'Ben', score: 500, answeredIndex: null },
  ]
  it('ranks with shared ranks for ties', () => {
    expect(rankPlayers(players).map(p => [p.displayName, p.rank])).toEqual([['Ana', 1], ['Ben', 2], ['Cy', 2]])
  })
  it('counts answers for the open question only', () => {
    expect(answeredCount(players, 1)).toBe(2)
    expect(answeredCount(players, 2)).toBe(0)
  })
  it('never shows negative seconds', () => {
    expect(secondsLeft(10_000, 4_500)).toBe(6)
    expect(secondsLeft(10_000, 20_000)).toBe(0)
  })
})
