import { describe, expect, it } from 'vitest'
import { GameInputError } from './gameLogic'
import {
  assertHost,
  consumeRateWindow,
  parseCreateGameRequest,
  parseEmptyRequest,
  parseGameIdRequest,
  parseJoinRequest,
  parseKickRequest,
  parseSubmitRequest,
} from './gameRequests'
import { buildReveal } from './gameReveal'

describe('parseCreateGameRequest', () => {
  const deck = { kind: 'deck', classId: 'class_1', deckId: 'deck-1' }
  it('accepts a deck or lesson source with a valid time limit', () => {
    expect(parseCreateGameRequest({ source: deck, timeLimitSec: 20 })).toEqual({ source: deck, timeLimitSec: 20, groupId: null })
    expect(parseCreateGameRequest({ source: { kind: 'lesson', planId: 'plan1' }, timeLimitSec: 10, groupId: 'g1' })).toEqual({ source: { kind: 'lesson', planId: 'plan1' }, timeLimitSec: 10, groupId: 'g1' })
  })
  it('rejects extra fields at every level', () => {
    expect(() => parseCreateGameRequest({ source: deck, timeLimitSec: 20, hostId: 'x' })).toThrow(GameInputError)
    expect(() => parseCreateGameRequest({ source: { ...deck, extra: 1 }, timeLimitSec: 20 })).toThrow(GameInputError)
  })
  it('rejects malformed input', () => {
    for (const bad of [null, 'x', [], {}, { source: deck }, { source: 'deck', timeLimitSec: 20 }, { source: { kind: 'other' }, timeLimitSec: 20 }, { source: deck, timeLimitSec: 5 }, { source: deck, timeLimitSec: 20, groupId: '../x' }, { source: { kind: 'deck', classId: 'a/b', deckId: 'd' }, timeLimitSec: 20 }]) {
      expect(() => parseCreateGameRequest(bad)).toThrow(GameInputError)
    }
  })
})

describe('other request parsers', () => {
  it('normalizes join codes and cleans names', () => {
    expect(parseJoinRequest({ code: 'abc-234', displayName: '  Ana  ' })).toEqual({ code: 'ABC234', displayName: 'Ana' })
    expect(() => parseJoinRequest({ code: 'ABC234', displayName: '' })).toThrow(GameInputError)
    expect(() => parseJoinRequest({ code: 'ABC234', displayName: 'Ana', score: 9999 })).toThrow(GameInputError)
    expect(() => parseJoinRequest({ code: 'bad', displayName: 'Ana' })).toThrow(GameInputError)
  })
  it('validates game ids', () => {
    expect(parseGameIdRequest({ gameId: 'abc_123' })).toEqual({ gameId: 'abc_123' })
    for (const bad of [{}, { gameId: '' }, { gameId: 'a/b' }, { gameId: 5 }, { gameId: 'a', x: 1 }]) expect(() => parseGameIdRequest(bad)).toThrow(GameInputError)
  })
  it('validates answer submissions', () => {
    expect(parseSubmitRequest({ gameId: 'g', questionIndex: 3, optionIndex: 2 })).toEqual({ gameId: 'g', questionIndex: 3, optionIndex: 2 })
    for (const bad of [{ gameId: 'g', questionIndex: -1, optionIndex: 0 }, { gameId: 'g', questionIndex: 20, optionIndex: 0 }, { gameId: 'g', questionIndex: 0, optionIndex: 4 }, { gameId: 'g', questionIndex: 0.5, optionIndex: 0 }, { gameId: 'g', questionIndex: 0, optionIndex: '1' }, { gameId: 'g', questionIndex: 0, optionIndex: 0, score: 5000 }]) {
      expect(() => parseSubmitRequest(bad)).toThrow(GameInputError)
    }
  })
  it('validates kick requests and empty requests', () => {
    expect(parseKickRequest({ gameId: 'g', playerUid: 'u:1' })).toEqual({ gameId: 'g', playerUid: 'u:1' })
    expect(() => parseKickRequest({ gameId: 'g', playerUid: 'a/b' })).toThrow(GameInputError)
    expect(() => parseEmptyRequest(undefined)).not.toThrow()
    expect(() => parseEmptyRequest({})).not.toThrow()
    expect(() => parseEmptyRequest({ a: 1 })).toThrow(GameInputError)
  })
})

describe('host-only check', () => {
  it('allows the host and refuses everyone else with permission-denied', () => {
    expect(() => assertHost({ hostId: 'h' }, 'h')).not.toThrow()
    try { assertHost({ hostId: 'h' }, 'p'); expect.unreachable() } catch (error) { expect((error as GameInputError).code).toBe('permission-denied') }
    expect(() => assertHost(undefined, 'h')).toThrow(GameInputError)
  })
})

describe('join rate limit window', () => {
  it('allows up to the limit inside a window, then blocks, then resets', () => {
    let state = null as ReturnType<typeof consumeRateWindow>['next'] | null
    for (let i = 0; i < 3; i += 1) { const r = consumeRateWindow(state, 1000 + i, 3, 60_000); expect(r.allowed).toBe(true); state = r.next }
    const blocked = consumeRateWindow(state, 2000, 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.next).toEqual(state)
    expect(consumeRateWindow(state, 62_000, 3, 60_000)).toEqual({ allowed: true, next: { startedAtMs: 62_000, count: 1 } })
  })
  it('resets if the clock moved backwards', () => {
    expect(consumeRateWindow({ startedAtMs: 5000, count: 99 }, 1000, 3, 60_000).allowed).toBe(true)
  })
})

describe('buildReveal', () => {
  const players = [{ uid: 'a', score: 100 }, { uid: 'b', score: 0 }, { uid: 'c', score: 50 }, { uid: 'd', score: 0 }]
  const answers = new Map([
    ['a', { optionIndex: 1, answeredAtMs: 0 }],
    ['b', { optionIndex: 0, answeredAtMs: 0 }],
    ['c', { optionIndex: 1, answeredAtMs: 20_000 }],
    ['ghost', { optionIndex: 1, answeredAtMs: 0 }],
  ])
  it('scores correct answers, ignores wrong, missing and non-player answers', () => {
    const result = buildReveal({ correctIndex: 1, startedAtMs: 0, endsAtMs: 20_000, players, answers })
    expect(result.perPlayerPoints).toEqual({ a: 1500, b: 0, c: 1000, d: 0 })
    expect(result.scores).toEqual({ a: 1600, b: 0, c: 1050, d: 0 })
    expect('ghost' in result.perPlayerPoints).toBe(false)
  })
  it('gives nothing for late answers', () => {
    const late = new Map([['a', { optionIndex: 1, answeredAtMs: 30_000 }]])
    expect(buildReveal({ correctIndex: 1, startedAtMs: 0, endsAtMs: 20_000, players: [{ uid: 'a', score: 0 }], answers: late }).perPlayerPoints.a).toBe(0)
  })
})
