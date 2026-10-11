import { describe, expect, it } from 'vitest'
import {
  GROUP_LIMITS,
  GroupQuizError,
  TEAM_CODE_ALPHABET,
  assertCanJoin,
  assertCanStart,
  assertCanSubmit,
  autoAnswer,
  blankCountOf,
  buildQuestionOrder,
  canAdvanceReview,
  canLockAnswer,
  cleanTeamName,
  generateTeamCode,
  isTimeUp,
  nextTeamStatus,
  normalizeTeamCode,
  parseGroupSettings,
  questionDeadline,
  representativeAfterLeave,
  statusForMemberCount,
  validateAnswer,
  withoutMember,
  type TeamStatus,
} from './groupQuizLogic'

function codeOf(fn: () => unknown): string | undefined {
  try { fn() } catch (error) { return (error as GroupQuizError).code }
  return undefined
}

describe('parseGroupSettings', () => {
  it('applies defaults to older documents that only had groupSize', () => {
    expect(parseGroupSettings({ type: 'group', groupSize: 3 })).toEqual({ groupSize: 3, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null })
  })
  it('reads every field of a new document', () => {
    const full = { type: 'group', groupSize: 5, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 45 }
    expect(parseGroupSettings(full)).toEqual({ groupSize: 5, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 45 })
  })
  it('treats an explicit null timer as no timer and accepts the timer bounds', () => {
    expect(parseGroupSettings({ type: 'group', groupSize: 2, questionTimeSec: null }).questionTimeSec).toBeNull()
    expect(parseGroupSettings({ type: 'group', groupSize: 2, questionTimeSec: 10 }).questionTimeSec).toBe(10)
    expect(parseGroupSettings({ type: 'group', groupSize: 10, questionTimeSec: 300 }).questionTimeSec).toBe(300)
  })
  it('refuses individual quizzes and non-objects', () => {
    expect(codeOf(() => parseGroupSettings({ type: 'individual' }))).toBe('failed-precondition')
    expect(codeOf(() => parseGroupSettings(null))).toBe('failed-precondition')
    expect(codeOf(() => parseGroupSettings('group'))).toBe('failed-precondition')
  })
  it('rejects out-of-range or malformed values', () => {
    const bad: unknown[] = [
      { type: 'group', groupSize: 1 },
      { type: 'group', groupSize: 11 },
      { type: 'group', groupSize: 2.5 },
      { type: 'group', groupSize: '3' },
      { type: 'group' },
      { type: 'group', groupSize: 3, answerMode: 'solo' },
      { type: 'group', groupSize: 3, teamFormation: 'random' },
      { type: 'group', groupSize: 3, waitForEveryone: 'yes' },
      { type: 'group', groupSize: 3, questionTimeSec: 9 },
      { type: 'group', groupSize: 3, questionTimeSec: 301 },
      { type: 'group', groupSize: 3, questionTimeSec: 20.5 },
      { type: 'group', groupSize: 3, questionTimeSec: '20' },
    ]
    for (const participation of bad) expect(codeOf(() => parseGroupSettings(participation))).toBe('failed-precondition')
  })
})

describe('team codes', () => {
  it('only uses the unambiguous alphabet (no I, L, O, 0, 1)', () => {
    for (const ch of 'ILO01') expect(TEAM_CODE_ALPHABET.includes(ch)).toBe(false)
    expect(TEAM_CODE_ALPHABET).toHaveLength(31)
  })
  it('generates 6 characters, deterministically for a fixed random source, clamped at the ends', () => {
    expect(generateTeamCode(() => 0)).toBe('AAAAAA')
    expect(generateTeamCode(() => 0.999999)).toBe('999999')
    expect(generateTeamCode(() => 1)).toBe('999999')
  })
  it('generates valid codes with the default random source', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateTeamCode()
      expect(code).toHaveLength(GROUP_LIMITS.codeLength)
      expect([...code].every(ch => TEAM_CODE_ALPHABET.includes(ch))).toBe(true)
      expect(normalizeTeamCode(code)).toBe(code)
    }
  })
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeTeamCode('abc-234')).toBe('ABC234')
    expect(normalizeTeamCode('  abc 234  ')).toBe('ABC234')
  })
  it('rejects wrong length, ambiguous characters and non-strings', () => {
    for (const bad of ['ABCDE', 'ABCDEFG', 'ABCDEI', 'ABCDE0', 'ABCDE1', 'ABCD$2', '', 123, null, undefined, {}]) {
      expect(codeOf(() => normalizeTeamCode(bad))).toBe('invalid-argument')
    }
  })
})

describe('cleanTeamName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanTeamName('  Team   Rocket ')).toBe('Team Rocket')
  })
  it('turns control characters into spaces', () => {
    expect(cleanTeamName('A\u0000B')).toBe('A B')
    expect(cleanTeamName('A\nB\tC')).toBe('A B C')
    expect(cleanTeamName('A\u0085B')).toBe('A B')
  })
  it('keeps markup as plain text (it is data, rendered safely by the UI)', () => {
    expect(cleanTeamName('<b>x</b>')).toBe('<b>x</b>')
  })
  it('enforces 1 to 40 characters', () => {
    expect(cleanTeamName('a'.repeat(40))).toHaveLength(40)
    expect(codeOf(() => cleanTeamName('a'.repeat(41)))).toBe('invalid-argument')
    expect(codeOf(() => cleanTeamName(''))).toBe('invalid-argument')
    expect(codeOf(() => cleanTeamName('   \n  '))).toBe('invalid-argument')
  })
  it('rejects non-strings', () => {
    for (const bad of [null, undefined, 5, {}, []]) expect(codeOf(() => cleanTeamName(bad))).toBe('invalid-argument')
  })
})

describe('team status transitions', () => {
  const legal: Array<[TeamStatus, TeamStatus]> = [
    ['forming', 'forming'], ['forming', 'ready'],
    ['ready', 'forming'], ['ready', 'ready'], ['ready', 'in_progress'],
    ['in_progress', 'in_progress'], ['in_progress', 'submitted'],
  ]
  const illegal: Array<[TeamStatus, TeamStatus]> = [
    ['forming', 'in_progress'], ['forming', 'submitted'],
    ['ready', 'submitted'],
    ['in_progress', 'forming'], ['in_progress', 'ready'],
    ['submitted', 'forming'], ['submitted', 'ready'], ['submitted', 'in_progress'], ['submitted', 'submitted'],
  ]
  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(nextTeamStatus(from, to)).toBe(to)
  })
  it.each(illegal)('refuses %s -> %s with failed-precondition', (from, to) => {
    expect(codeOf(() => nextTeamStatus(from, to))).toBe('failed-precondition')
  })
  it('derives forming or ready from the member count', () => {
    expect(statusForMemberCount(0)).toBe('forming')
    expect(statusForMemberCount(1)).toBe('forming')
    expect(statusForMemberCount(2)).toBe('ready')
    expect(statusForMemberCount(10)).toBe('ready')
  })
})

describe('start and join rules', () => {
  const base = { memberCount: 3, groupSize: 4, status: 'ready' as TeamStatus, force: false }
  it('lets a ready team start', () => {
    expect(() => assertCanStart(base)).not.toThrow()
    expect(() => assertCanStart({ ...base, status: 'forming' })).not.toThrow()
  })
  it('refuses a team that already started or finished', () => {
    expect(codeOf(() => assertCanStart({ ...base, status: 'in_progress' }))).toBe('failed-precondition')
    expect(codeOf(() => assertCanStart({ ...base, status: 'submitted' }))).toBe('failed-precondition')
  })
  it('refuses a team larger than the quiz allows or with nobody in it', () => {
    expect(codeOf(() => assertCanStart({ ...base, memberCount: 5 }))).toBe('failed-precondition')
    expect(codeOf(() => assertCanStart({ ...base, memberCount: 0, force: true }))).toBe('failed-precondition')
  })
  it('needs 2 members unless forced', () => {
    expect(codeOf(() => assertCanStart({ ...base, memberCount: 1 }))).toBe('failed-precondition')
    expect(() => assertCanStart({ ...base, memberCount: 1, force: true })).not.toThrow()
  })
  it('lets people join until the team is full', () => {
    expect(() => assertCanJoin({ memberCount: 3, groupSize: 4, status: 'forming' })).not.toThrow()
    expect(codeOf(() => assertCanJoin({ memberCount: 4, groupSize: 4, status: 'forming' }))).toBe('resource-exhausted')
    expect(codeOf(() => assertCanJoin({ memberCount: 1, groupSize: 4, status: 'in_progress' }))).toBe('failed-precondition')
    expect(codeOf(() => assertCanJoin({ memberCount: 1, groupSize: 4, status: 'submitted' }))).toBe('failed-precondition')
  })
})

describe('members leaving', () => {
  it('removes only the leaving member and does not mutate the input', () => {
    const members = ['a', 'b', 'c']
    expect(withoutMember(members, 'b')).toEqual(['a', 'c'])
    expect(withoutMember(members, 'zzz')).toEqual(['a', 'b', 'c'])
    expect(members).toEqual(['a', 'b', 'c'])
  })
  it('hands the representative role to the longest-standing member', () => {
    expect(representativeAfterLeave(['a', 'b', 'c'], 'a', 'a')).toBe('b')
    expect(representativeAfterLeave(['a', 'b', 'c'], 'a', 'b')).toBe('a')
    expect(representativeAfterLeave(['a', 'b', 'c'], 'c', 'c')).toBe('a')
  })
  it('returns null when the team becomes empty', () => {
    expect(representativeAfterLeave(['a'], 'a', 'a')).toBeNull()
  })
})

describe('deadlines', () => {
  it('has no deadline without a timer', () => {
    expect(questionDeadline(1000, null)).toBeNull()
    expect(isTimeUp(null, 9e12)).toBe(false)
  })
  it('adds the timer to the start time', () => {
    expect(questionDeadline(1000, 30)).toBe(31_000)
  })
  it('includes the network grace before time is up', () => {
    const ends = 10_000
    expect(isTimeUp(ends, ends)).toBe(false)
    expect(isTimeUp(ends, ends + GROUP_LIMITS.lateGraceMs - 1)).toBe(false)
    expect(isTimeUp(ends, ends + GROUP_LIMITS.lateGraceMs)).toBe(true)
    expect(isTimeUp(ends, ends + 5, 0)).toBe(true)
  })
})

describe('assertCanSubmit', () => {
  const base = {
    answerMode: 'representative' as const,
    uid: 'rep',
    memberIds: ['rep', 'm2', 'm3'],
    representativeId: 'rep',
    phase: 'answering' as const,
    currentIndex: 2,
    questionIndex: 2,
    endsAtMs: null as number | null,
    nowMs: 5000,
  }
  it('lets the representative answer in representative mode', () => {
    expect(() => assertCanSubmit(base)).not.toThrow()
  })
  it('rejects a non-representative in representative mode', () => {
    expect(codeOf(() => assertCanSubmit({ ...base, uid: 'm2' }))).toBe('permission-denied')
  })
  it('lets any member answer in everyone mode', () => {
    expect(() => assertCanSubmit({ ...base, answerMode: 'everyone', uid: 'm3' })).not.toThrow()
  })
  it('rejects people who are not on the team, in either mode', () => {
    expect(codeOf(() => assertCanSubmit({ ...base, uid: 'stranger' }))).toBe('permission-denied')
    expect(codeOf(() => assertCanSubmit({ ...base, answerMode: 'everyone', uid: 'stranger' }))).toBe('permission-denied')
  })
  it('rejects answers outside the answering phase', () => {
    expect(codeOf(() => assertCanSubmit({ ...base, phase: 'review' }))).toBe('failed-precondition')
    expect(codeOf(() => assertCanSubmit({ ...base, phase: 'finished' }))).toBe('failed-precondition')
  })
  it('rejects late or stale questions (wrong index)', () => {
    expect(codeOf(() => assertCanSubmit({ ...base, questionIndex: 1 }))).toBe('failed-precondition')
    expect(codeOf(() => assertCanSubmit({ ...base, questionIndex: 3 }))).toBe('failed-precondition')
  })
  it('rejects answers after the server deadline plus grace, accepts them inside it', () => {
    const endsAtMs = 10_000
    expect(() => assertCanSubmit({ ...base, endsAtMs, nowMs: endsAtMs + GROUP_LIMITS.lateGraceMs - 1 })).not.toThrow()
    expect(codeOf(() => assertCanSubmit({ ...base, endsAtMs, nowMs: endsAtMs + GROUP_LIMITS.lateGraceMs }))).toBe('failed-precondition')
  })
})

describe('everyone-mode lock rules', () => {
  it('lets anyone lock at any time when not waiting', () => {
    expect(canLockAnswer({ waitForEveryone: false, memberCount: 3, pickCount: 0, endsAtMs: null, nowMs: 0 })).toBe(true)
  })
  it('waits for every pick when waiting is on', () => {
    expect(canLockAnswer({ waitForEveryone: true, memberCount: 3, pickCount: 2, endsAtMs: null, nowMs: 0 })).toBe(false)
    expect(canLockAnswer({ waitForEveryone: true, memberCount: 3, pickCount: 3, endsAtMs: null, nowMs: 0 })).toBe(true)
  })
  it('wait + timer: locking opens when everyone answered OR the timer ended', () => {
    const ends = 10_000
    expect(canLockAnswer({ waitForEveryone: true, memberCount: 3, pickCount: 1, endsAtMs: ends, nowMs: ends })).toBe(false)
    expect(canLockAnswer({ waitForEveryone: true, memberCount: 3, pickCount: 1, endsAtMs: ends, nowMs: ends + GROUP_LIMITS.lateGraceMs })).toBe(true)
    expect(canLockAnswer({ waitForEveryone: true, memberCount: 3, pickCount: 3, endsAtMs: ends, nowMs: 0 })).toBe(true)
  })
})

describe('review pacing', () => {
  it('free pace: any member may continue', () => {
    expect(canAdvanceReview({ waitForEveryone: false, memberCount: 3, readyCount: 0, reviewElapsedMs: 0, hasTimer: false })).toBe(true)
  })
  it('wait without timer: needs every member ready, and never times out', () => {
    expect(canAdvanceReview({ waitForEveryone: true, memberCount: 3, readyCount: 2, reviewElapsedMs: 999_999, hasTimer: false })).toBe(false)
    expect(canAdvanceReview({ waitForEveryone: true, memberCount: 3, readyCount: 3, reviewElapsedMs: 0, hasTimer: false })).toBe(true)
  })
  it('wait + timer: a stalled review moves on after the review grace', () => {
    expect(canAdvanceReview({ waitForEveryone: true, memberCount: 3, readyCount: 2, reviewElapsedMs: GROUP_LIMITS.reviewGraceMs - 1, hasTimer: true })).toBe(false)
    expect(canAdvanceReview({ waitForEveryone: true, memberCount: 3, readyCount: 2, reviewElapsedMs: GROUP_LIMITS.reviewGraceMs, hasTimer: true })).toBe(true)
  })
})

describe('autoAnswer', () => {
  it('picks the most common answer', () => {
    expect(autoAnswer({ a: 'x', b: 'y', c: 'y' }, ['a', 'b', 'c'])).toBe('y')
  })
  it('breaks ties in favor of the earliest member', () => {
    expect(autoAnswer({ a: 'x', b: 'y' }, ['a', 'b'])).toBe('x')
    expect(autoAnswer({ a: 'x', b: 'y' }, ['b', 'a'])).toBe('y')
  })
  it('compares list answers by value', () => {
    expect(autoAnswer({ a: ['1', '2'], b: ['1', '2'], c: ['9'] }, ['c', 'a', 'b'])).toEqual(['1', '2'])
  })
  it('ignores people who did not answer and picks from members only', () => {
    expect(autoAnswer({ ghost: 'z', b: 'y' }, ['a', 'b'])).toBe('y')
  })
  it('returns null when nobody answered', () => {
    expect(autoAnswer({}, ['a', 'b'])).toBeNull()
    expect(autoAnswer({ ghost: 'z' }, ['a'])).toBeNull()
  })
})

describe('blankCountOf', () => {
  it('counts runs of 3+ underscores and [blank] markers', () => {
    expect(blankCountOf('A ___ and [blank] and [BLANK]')).toBe(3)
    expect(blankCountOf('no blanks here')).toBe(0)
    expect(blankCountOf('too short __ here')).toBe(0)
  })
})

describe('validateAnswer', () => {
  const mc = { type: 'multiple_choice', prompt: 'Pick', options: ['o1', 'o2', 'o3'] }
  it('multiple choice and true/false accept only a listed option id', () => {
    expect(validateAnswer(mc, 'o2')).toBe('o2')
    expect(validateAnswer({ type: 'true_false', prompt: 'T?', options: ['t', 'f'] }, 'f')).toBe('f')
    for (const bad of ['o9', '', 5, null, undefined, ['o1']]) expect(codeOf(() => validateAnswer(mc, bad))).toBe('invalid-argument')
  })
  it('identification needs 1 to 500 characters of real text', () => {
    const q = { type: 'identification', prompt: 'Name it' }
    expect(validateAnswer(q, 'Paris')).toBe('Paris')
    expect(validateAnswer(q, 'a'.repeat(GROUP_LIMITS.maxAnswerLength))).toHaveLength(GROUP_LIMITS.maxAnswerLength)
    for (const bad of ['', '   ', 'a'.repeat(GROUP_LIMITS.maxAnswerLength + 1), 5, ['x']]) expect(codeOf(() => validateAnswer(q, bad))).toBe('invalid-argument')
  })
  it('fill in the blank needs exactly one string per blank', () => {
    const q = { type: 'fill_blank', prompt: 'The ___ is ___' }
    expect(validateAnswer(q, ['a', 'b'])).toEqual(['a', 'b'])
    expect(validateAnswer(q, ['', ''])).toEqual(['', ''])
    for (const bad of [['a'], ['a', 'b', 'c'], 'a', ['a', 5], ['a', 'b'.repeat(GROUP_LIMITS.maxBlankLength + 1)]]) expect(codeOf(() => validateAnswer(q, bad))).toBe('invalid-argument')
  })
  it('fill in the blank with no blanks in the prompt is rejected', () => {
    expect(codeOf(() => validateAnswer({ type: 'fill_blank', prompt: 'nothing to fill' }, []))).toBe('invalid-argument')
  })
  it('flashcards and canvas cannot be answered as a team', () => {
    expect(codeOf(() => validateAnswer({ type: 'flashcard', prompt: 'x' }, 'y'))).toBe('failed-precondition')
    expect(codeOf(() => validateAnswer({ type: 'canvas', prompt: 'x' }, 'y'))).toBe('failed-precondition')
  })
})

describe('buildQuestionOrder', () => {
  it('keeps the order (as a copy) when not shuffling', () => {
    const items = [1, 2, 3]
    const order = buildQuestionOrder(items, false)
    expect(order).toEqual([1, 2, 3])
    expect(order).not.toBe(items)
  })
  it('shuffles deterministically for a fixed random source without mutating the input', () => {
    const items = [1, 2, 3, 4]
    expect(buildQuestionOrder(items, true, () => 0)).toEqual([2, 3, 4, 1])
    expect(items).toEqual([1, 2, 3, 4])
  })
  it('always returns a permutation', () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    expect([...buildQuestionOrder(items, true)].sort((a, b) => a - b)).toEqual(items)
  })
})
