import { describe, expect, it } from 'vitest'
import type { GroupParticipation } from '../../quizzes/types'
import type { Team, TeamReveal } from '../../quizzes/types/team'
import {
  answerText, answeredCount, blankCountOf, currentReveal, describeGroupRules, emptyAnswer, estimateClockOffsetMs, formatClock, formatCode,
  isAnswerComplete, isValidCode, memberProgress, normalizeCodeInput, playerRole, promptPieces, revealOutcome, scoreLabel, secondsLeft,
  shouldAskServerToAdvance, startHint,
} from './teamPlayLogic'

const settings = (overrides: Partial<GroupParticipation> = {}): GroupParticipation => ({ type: 'group', groupSize: 4, answerMode: 'representative', teamFormation: 'self', waitForEveryone: false, questionTimeSec: null, ...overrides })
const team: Pick<Team, 'memberIds' | 'memberNames' | 'representativeId' | 'status'> = { memberIds: ['a', 'b', 'c'], memberNames: { a: 'Amy', b: 'Ben' }, representativeId: 'a', status: 'ready' }

describe('blanks', () => {
  it('counts blanks the same way as the server', () => {
    expect(blankCountOf('The ___ is ____ and [blank].')).toBe(3)
    expect(blankCountOf('Only __ two underscores')).toBe(0)
    expect(blankCountOf('No blanks')).toBe(0)
  })
  it('splits the prompt around the blanks', () => { expect(promptPieces('A ___ b [BLANK] c')).toEqual(['A ', ' b ', ' c']) })
})

describe('team codes', () => {
  it('normalizes and validates', () => {
    expect(normalizeCodeInput(' abc-234 ')).toBe('ABC234')
    expect(isValidCode('abc-234')).toBe(true)
    expect(isValidCode('ABC23')).toBe(false)
    expect(isValidCode('ABCO23')).toBe(false)
    expect(isValidCode('ABC1I3')).toBe(false)
  })
  it('formats a code for reading aloud', () => {
    expect(formatCode('ABC234')).toBe('ABC-234')
    expect(formatCode('SHORT')).toBe('SHORT')
  })
})

describe('answers', () => {
  it('starts with the right empty answer', () => {
    expect(emptyAnswer({ type: 'identification', prompt: 'x' })).toBe('')
    expect(emptyAnswer({ type: 'fill_blank', prompt: 'a ___ b ___' })).toEqual(['', ''])
  })
  it('knows when an answer is complete', () => {
    expect(isAnswerComplete({ type: 'multiple_choice', prompt: '' }, 'o1')).toBe(true)
    expect(isAnswerComplete({ type: 'identification', prompt: '' }, '   ')).toBe(false)
    expect(isAnswerComplete({ type: 'fill_blank', prompt: 'a ___ b ___' }, ['x', ''])).toBe(false)
    expect(isAnswerComplete({ type: 'fill_blank', prompt: 'a ___ b ___' }, ['x', 'y'])).toBe(true)
    expect(isAnswerComplete({ type: 'fill_blank', prompt: 'no blank' }, [])).toBe(false)
  })
  it('shows option text instead of ids', () => {
    const q = { options: [{ id: 'o1', text: 'Paris' }] }
    expect(answerText(q, 'o1')).toBe('Paris')
    expect(answerText(q, ' typed ')).toBe('typed')
    expect(answerText(q, ['a', ''])).toBe('a · (empty)')
    expect(answerText(q, null)).toBe('No answer')
  })
})

describe('time', () => {
  it('counts whole seconds and never goes below zero', () => {
    expect(secondsLeft(10_000, 4_500)).toBe(6)
    expect(secondsLeft(10_000, 10_000)).toBe(0)
    expect(secondsLeft(10_000, 99_000)).toBe(0)
    expect(secondsLeft(null, 5)).toBeNull()
  })
  it('formats m:ss', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(5)).toBe('0:05')
    expect(formatClock(-3)).toBe('0:00')
  })
  it('uses a fresh server stamp as a clock sample and ignores stale ones', () => {
    expect(estimateClockOffsetMs(100_000, 100_300)).toBe(-300)
    expect(estimateClockOffsetMs(100_000, 160_000)).toBeNull()
    expect(estimateClockOffsetMs(130_000, 100_000)).toBeNull()
    expect(estimateClockOffsetMs(null, 100_000)).toBeNull()
  })
  it('asks the server to advance only for an open, unlocked, timed question past its deadline', () => {
    const open = { phase: 'answering' as const, locked: false, questionEndsAt: 5_000 }
    expect(shouldAskServerToAdvance(open, 4_999)).toBe(false)
    expect(shouldAskServerToAdvance(open, 5_000)).toBe(true)
    expect(shouldAskServerToAdvance({ ...open, locked: true }, 9_000)).toBe(false)
    expect(shouldAskServerToAdvance({ ...open, phase: 'review' }, 9_000)).toBe(false)
    expect(shouldAskServerToAdvance({ ...open, questionEndsAt: null }, 9_000)).toBe(false)
  })
})

describe('member progress', () => {
  it('lists every member with a name fallback', () => {
    const rows = memberProgress(team, { b: true }, 'c')
    expect(rows.map(row => row.name)).toEqual(['Amy', 'Ben', 'Student'])
    expect(rows.map(row => row.answered)).toEqual([false, true, false])
    expect(rows[0]?.isRepresentative).toBe(true)
    expect(rows[2]?.isMe).toBe(true)
    expect(answeredCount(team, { a: true, b: true, z: true })).toBe(2)
  })
})

describe('playerRole', () => {
  const open = { phase: 'answering' as const, locked: false, answered: {} as Record<string, true> }
  const base = { team, session: open, timeUp: false }
  it('representative mode: only the representative answers, nobody locks', () => {
    expect(playerRole({ ...base, settings: settings(), uid: 'a' })).toEqual({ canAnswer: true, canLock: false, reason: '' })
    const other = playerRole({ ...base, settings: settings(), uid: 'b' })
    expect(other.canAnswer).toBe(false)
    expect(other.reason).toMatch(/representative/)
  })
  it('everyone mode: each member answers once, then may lock', () => {
    const s = settings({ answerMode: 'everyone' })
    expect(playerRole({ ...base, settings: s, uid: 'b' })).toEqual({ canAnswer: true, canLock: false, reason: '' })
    expect(playerRole({ ...base, settings: s, uid: 'b', session: { ...open, answered: { b: true } } })).toEqual({ canAnswer: false, canLock: true, reason: '' })
  })
  it('everyone mode with waiting: locking needs every pick', () => {
    const s = settings({ answerMode: 'everyone', waitForEveryone: true })
    expect(playerRole({ ...base, settings: s, uid: 'b', session: { ...open, answered: { b: true } } }).canLock).toBe(false)
    expect(playerRole({ ...base, settings: s, uid: 'b', session: { ...open, answered: { a: true, b: true, c: true } } }).canLock).toBe(true)
  })
  it('nobody acts on a closed question, after time is up, or when not on the team', () => {
    const s = settings({ answerMode: 'everyone' })
    expect(playerRole({ ...base, settings: s, uid: 'b', session: { ...open, locked: true } }).canAnswer).toBe(false)
    expect(playerRole({ ...base, settings: s, uid: 'b', session: { ...open, phase: 'review' } }).canAnswer).toBe(false)
    expect(playerRole({ ...base, settings: s, uid: 'b', timeUp: true }).reason).toMatch(/Time is up/)
    expect(playerRole({ ...base, settings: s, uid: 'zzz' }).reason).toMatch(/not on this team/)
  })
})

describe('wording', () => {
  it('explains each pacing combination', () => {
    expect(describeGroupRules(settings()).join(' ')).toMatch(/own pace/)
    expect(describeGroupRules(settings({ waitForEveryone: true })).join(' ')).toMatch(/waits for everyone/)
    expect(describeGroupRules(settings({ questionTimeSec: 30 })).join(' ')).toMatch(/30 seconds/)
    expect(describeGroupRules(settings({ questionTimeSec: 30, waitForEveryone: true })).join(' ')).toMatch(/everyone is done or time runs out/)
    expect(describeGroupRules(settings({ answerMode: 'everyone' }))[0]).toMatch(/locks in/)
  })
  it('gives a start hint for every state', () => {
    expect(startHint({ memberIds: ['a'], status: 'forming' }, 4)).toMatch(/at least 2/)
    expect(startHint({ memberIds: ['a', 'b'], status: 'ready' }, 4)).toMatch(/2 of 4/)
    expect(startHint({ memberIds: ['a', 'b', 'c', 'd'], status: 'ready' }, 4)).toMatch(/Everyone is here/)
    expect(startHint({ memberIds: ['a', 'b'], status: 'in_progress' }, 4)).toMatch(/playing now/)
  })
  it('labels scores', () => {
    expect(scoreLabel({ score: 7, maxScore: 10 })).toBe('7 / 10')
    expect(scoreLabel({ score: null, maxScore: null })).toBe('Score not shown')
  })
  it('describes a reveal with text, not colour', () => {
    const reveal = (result: TeamReveal['result']) => ({ result })
    expect(revealOutcome(reveal(null))).toEqual({ label: 'Answer recorded', known: false, correct: false })
    expect(revealOutcome(reveal({ correct: true, pointsAwarded: 1, correctAnswer: 'a', explanation: '' })).label).toBe('Correct')
    expect(revealOutcome(reveal({ correct: false, pointsAwarded: 0, correctAnswer: 'a', explanation: '' })).label).toBe('Not quite')
  })
  it('finds the reveal of the question under review only', () => {
    const reveals = [{ index: 0 }, { index: 1 }] as TeamReveal[]
    expect(currentReveal(reveals, { phase: 'review', currentIndex: 1 })?.index).toBe(1)
    expect(currentReveal(reveals, { phase: 'answering', currentIndex: 1 })).toBeNull()
    expect(currentReveal(reveals, { phase: 'review', currentIndex: 5 })).toBeNull()
  })
})
