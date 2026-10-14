import { describe, expect, it } from 'vitest'
import { GroupQuizError } from './groupQuizLogic'
import {
  consumeRateWindow,
  parseAnswerRequest,
  parseCreateAssignedTeam,
  parseCreateSelfTeam,
  parseEmptyRequest,
  parseJoinTeam,
  parseOverrideTeamQuestion,
  parseQuestionStep,
  parseQuizRequest,
  parseRemoveMember,
  parseSetRepresentative,
  parseStartTeam,
  parseTeamRef,
  type RateWindow,
} from './groupQuizRequests'

const throwsGroupError = (fn: () => unknown) => expect(fn).toThrow(GroupQuizError)

describe('parseQuizRequest and parseTeamRef', () => {
  it('accept valid ids', () => {
    expect(parseQuizRequest({ quizId: 'quiz_1-A' })).toEqual({ quizId: 'quiz_1-A' })
    expect(parseTeamRef({ quizId: 'q', teamId: 't' })).toEqual({ quizId: 'q', teamId: 't' })
  })
  it('reject non-objects, arrays, missing, extra and unsafe ids', () => {
    for (const bad of [null, undefined, 'x', 5, [], {}, { quizId: '' }, { quizId: 'a/b' }, { quizId: '../x' }, { quizId: 'a b' }, { quizId: 5 }, { quizId: 'q', extra: 1 }, { quizId: 'a'.repeat(129) }]) {
      throwsGroupError(() => parseQuizRequest(bad))
    }
    for (const bad of [{ quizId: 'q' }, { teamId: 't' }, { quizId: 'q', teamId: 'a/b' }, { quizId: 'q', teamId: 't', score: 9 }]) {
      throwsGroupError(() => parseTeamRef(bad))
    }
  })
})

describe('parseCreateAssignedTeam', () => {
  const valid = { quizId: 'q', name: '  Team   One ', memberIds: ['u1', 'u2'], representativeId: 'u2' }
  it('cleans the name and keeps member order', () => {
    expect(parseCreateAssignedTeam(valid)).toEqual({ quizId: 'q', name: 'Team One', memberIds: ['u1', 'u2'], representativeId: 'u2' })
  })
  it('accepts a single member and up to 10 members', () => {
    expect(parseCreateAssignedTeam({ ...valid, memberIds: ['u1'], representativeId: 'u1' }).memberIds).toEqual(['u1'])
    const ten = Array.from({ length: 10 }, (_, i) => `u${i}`)
    expect(parseCreateAssignedTeam({ ...valid, memberIds: ten, representativeId: 'u0' }).memberIds).toHaveLength(10)
  })
  it('rejects empty, oversized, duplicated and malformed member lists', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `u${i}`)
    for (const memberIds of [[], eleven, ['u1', 'u1'], ['a/b'], [5], 'u1', null]) {
      throwsGroupError(() => parseCreateAssignedTeam({ ...valid, memberIds, representativeId: 'u1' }))
    }
  })
  it('requires the representative to be a member', () => {
    throwsGroupError(() => parseCreateAssignedTeam({ ...valid, representativeId: 'someone-else' }))
  })
  it('rejects extra and missing fields and bad names', () => {
    throwsGroupError(() => parseCreateAssignedTeam({ ...valid, code: 'ABC234' }))
    throwsGroupError(() => parseCreateAssignedTeam({ quizId: 'q', name: 'x', memberIds: ['u1'] }))
    throwsGroupError(() => parseCreateAssignedTeam({ ...valid, name: '' }))
    throwsGroupError(() => parseCreateAssignedTeam({ ...valid, name: 'x'.repeat(41) }))
  })
})

describe('parseCreateSelfTeam', () => {
  it('defaults the study group to null', () => {
    expect(parseCreateSelfTeam({ quizId: 'q', name: 'Us' })).toEqual({ quizId: 'q', name: 'Us', studyGroupId: null })
    expect(parseCreateSelfTeam({ quizId: 'q', name: 'Us', studyGroupId: null }).studyGroupId).toBeNull()
  })
  it('accepts a study group id and rejects unsafe ones', () => {
    expect(parseCreateSelfTeam({ quizId: 'q', name: 'Us', studyGroupId: 'sg_1' }).studyGroupId).toBe('sg_1')
    throwsGroupError(() => parseCreateSelfTeam({ quizId: 'q', name: 'Us', studyGroupId: '../x' }))
    throwsGroupError(() => parseCreateSelfTeam({ quizId: 'q', name: 'Us', studyGroupId: 5 }))
  })
  it('rejects extra fields such as a client-chosen code', () => {
    throwsGroupError(() => parseCreateSelfTeam({ quizId: 'q', name: 'Us', code: 'ABC234' }))
    throwsGroupError(() => parseCreateSelfTeam({ quizId: 'q', name: 'Us', memberIds: ['x'] }))
  })
})

describe('parseJoinTeam', () => {
  it('normalizes the code', () => {
    expect(parseJoinTeam({ quizId: 'q', code: 'abc-234' })).toEqual({ quizId: 'q', code: 'ABC234' })
  })
  it('rejects bad codes and extra fields', () => {
    throwsGroupError(() => parseJoinTeam({ quizId: 'q', code: 'nope' }))
    throwsGroupError(() => parseJoinTeam({ quizId: 'q', code: 'ABC234', teamId: 't' }))
    throwsGroupError(() => parseJoinTeam({ quizId: 'q' }))
  })
})

describe('parseSetRepresentative and parseRemoveMember', () => {
  it('accept valid payloads', () => {
    expect(parseSetRepresentative({ quizId: 'q', teamId: 't', memberId: 'u:1' })).toEqual({ quizId: 'q', teamId: 't', memberId: 'u:1' })
    expect(parseRemoveMember({ quizId: 'q', teamId: 't', memberId: 'u1' })).toEqual({ quizId: 'q', teamId: 't', memberId: 'u1' })
  })
  it('reject unsafe member ids and extra fields', () => {
    throwsGroupError(() => parseSetRepresentative({ quizId: 'q', teamId: 't', memberId: 'a/b' }))
    throwsGroupError(() => parseSetRepresentative({ quizId: 'q', teamId: 't', memberId: 'u', isAdmin: true }))
    throwsGroupError(() => parseRemoveMember({ quizId: 'q', teamId: 't' }))
  })
})

describe('parseStartTeam', () => {
  it('defaults force to false and accepts a boolean', () => {
    expect(parseStartTeam({ quizId: 'q', teamId: 't' })).toEqual({ quizId: 'q', teamId: 't', force: false })
    expect(parseStartTeam({ quizId: 'q', teamId: 't', force: true }).force).toBe(true)
    expect(parseStartTeam({ quizId: 'q', teamId: 't', force: false }).force).toBe(false)
  })
  it('rejects a non-boolean force', () => {
    throwsGroupError(() => parseStartTeam({ quizId: 'q', teamId: 't', force: 'yes' }))
    throwsGroupError(() => parseStartTeam({ quizId: 'q', teamId: 't', force: 1 }))
  })
})

describe('parseAnswerRequest', () => {
  const base = { quizId: 'q', teamId: 't', questionIndex: 0 }
  it('accepts a string answer or a short list of strings', () => {
    expect(parseAnswerRequest({ ...base, answer: 'opt1' }).answer).toBe('opt1')
    expect(parseAnswerRequest({ ...base, answer: ['a', 'b'] }).answer).toEqual(['a', 'b'])
    expect(parseAnswerRequest({ ...base, questionIndex: 199, answer: [] }).questionIndex).toBe(199)
  })
  it('rejects objects, numbers, long lists, mixed lists and null', () => {
    const tooLong = Array.from({ length: 21 }, () => 'x')
    for (const answer of [{ a: 1 }, 5, null, undefined, true, tooLong, ['a', 5], [['nested']]]) {
      throwsGroupError(() => parseAnswerRequest({ ...base, answer }))
    }
  })
  it('rejects bad question indexes', () => {
    for (const questionIndex of [-1, 200, 0.5, '1', null, NaN]) throwsGroupError(() => parseAnswerRequest({ ...base, questionIndex, answer: 'x' }))
  })
  it('rejects extra fields such as a client-sent score or time', () => {
    throwsGroupError(() => parseAnswerRequest({ ...base, answer: 'x', score: 100 }))
    throwsGroupError(() => parseAnswerRequest({ ...base, answer: 'x', answeredAt: 1 }))
  })
})

describe('parseQuestionStep and parseEmptyRequest', () => {
  it('parses a step request strictly', () => {
    expect(parseQuestionStep({ quizId: 'q', teamId: 't', questionIndex: 3 })).toEqual({ quizId: 'q', teamId: 't', questionIndex: 3 })
    throwsGroupError(() => parseQuestionStep({ quizId: 'q', teamId: 't' }))
    throwsGroupError(() => parseQuestionStep({ quizId: 'q', teamId: 't', questionIndex: 3, force: true }))
  })
  it('validates overrideTeamQuestion with questionIndex and expectedPhase', () => {
    expect(parseOverrideTeamQuestion({ quizId: 'q', teamId: 't', questionIndex: 2, expectedPhase: 'answering' }))
      .toEqual({ quizId: 'q', teamId: 't', questionIndex: 2, expectedPhase: 'answering' })
    expect(parseOverrideTeamQuestion({ quizId: 'q', teamId: 't', questionIndex: 0, expectedPhase: 'review' }))
      .toEqual({ quizId: 'q', teamId: 't', questionIndex: 0, expectedPhase: 'review' })
    throwsGroupError(() => parseOverrideTeamQuestion({ quizId: 'q', teamId: 't' }))
    throwsGroupError(() => parseOverrideTeamQuestion({ quizId: 'q', teamId: 't', questionIndex: 0, expectedPhase: 'finished' }))
    throwsGroupError(() => parseOverrideTeamQuestion({ quizId: 'q', teamId: 't', questionIndex: -1, expectedPhase: 'answering' }))
    throwsGroupError(() => parseOverrideTeamQuestion({ quizId: 'q', teamId: 't', questionIndex: 0, expectedPhase: 'answering', extra: 1 }))
  })
  it('allows an empty request and rejects anything else', () => {
    expect(() => parseEmptyRequest(undefined)).not.toThrow()
    expect(() => parseEmptyRequest(null)).not.toThrow()
    expect(() => parseEmptyRequest({})).not.toThrow()
    throwsGroupError(() => parseEmptyRequest({ a: 1 }))
    throwsGroupError(() => parseEmptyRequest('x'))
    throwsGroupError(() => parseEmptyRequest([]))
  })
})

describe('consumeRateWindow', () => {
  it('allows up to the limit inside a window, blocks, then resets', () => {
    let state: RateWindow | null = null
    for (let i = 0; i < 3; i += 1) {
      const result = consumeRateWindow(state, 1000 + i, 3, 60_000)
      expect(result.allowed).toBe(true)
      state = result.next
    }
    const blocked = consumeRateWindow(state, 2000, 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.next).toEqual(state)
    expect(consumeRateWindow(state, 61_000, 3, 60_000)).toEqual({ allowed: true, next: { startedAtMs: 61_000, count: 1 } })
  })
  it('starts a fresh window with no history and resets if the clock moved backwards', () => {
    expect(consumeRateWindow(null, 500, 3, 60_000)).toEqual({ allowed: true, next: { startedAtMs: 500, count: 1 } })
    expect(consumeRateWindow({ startedAtMs: 5000, count: 99 }, 1000, 3, 60_000).allowed).toBe(true)
  })
})
