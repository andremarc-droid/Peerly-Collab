import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { attemptEndMs, secondsUntil } from '../studentQuizzes/quizLogic'
import { parseQuizSettings } from './schemas'
import { defaultQuizSettings } from './schemas/settings'
import {
  describeWindow, effectiveTimeLimitSeconds, formatClock, formatDuration, fromDateTimeLocal, quizWindowState, splitSeconds, timeLimitFields,
  timingProblem, toDateTimeLocal,
} from './quizTiming'

const at = (iso: string) => Timestamp.fromDate(new Date(iso))

describe('time limit in seconds', () => {
  it('reads older quizzes that only stored minutes', () => {
    expect(effectiveTimeLimitSeconds({ timeLimitMinutes: 10 })).toBe(600)
    expect(effectiveTimeLimitSeconds({ timeLimitMinutes: null })).toBeNull()
  })

  it('prefers the exact seconds when they exist', () => {
    expect(effectiveTimeLimitSeconds({ timeLimitMinutes: 2, timeLimitSeconds: 90 })).toBe(90)
  })

  it('writes minutes (rounded up) and seconds together', () => {
    expect(timeLimitFields(90)).toEqual({ timeLimitMinutes: 2, timeLimitSeconds: 90 })
    expect(timeLimitFields(60)).toEqual({ timeLimitMinutes: 1, timeLimitSeconds: 60 })
    expect(timeLimitFields(null)).toEqual({ timeLimitMinutes: null, timeLimitSeconds: null })
  })

  it('splits and formats durations', () => {
    expect(splitSeconds(125)).toEqual({ minutes: 2, seconds: 5 })
    expect(formatDuration(90)).toBe('1 minute 30 seconds')
    expect(formatDuration(45)).toBe('45 seconds')
    expect(formatDuration(120)).toBe('2 minutes')
    expect(formatClock(245)).toBe('4:05')
    expect(formatClock(3723)).toBe('1:02:03')
  })

  it('rejects limits that are too short', () => {
    expect(timingProblem({ timeLimitMinutes: 1, timeLimitSeconds: 5 })).toMatch(/at least 10 seconds/)
    expect(timingProblem({ timeLimitMinutes: 1, timeLimitSeconds: 30 })).toBeNull()
  })
})

describe('availability window', () => {
  const opens = at('2026-10-20T08:00:00Z')
  const closes = at('2026-10-20T10:00:00Z')

  it('is always open without dates', () => {
    expect(quizWindowState({ opensAt: null, closesAt: null }, Date.now())).toBe('open')
    expect(describeWindow({ opensAt: null, closesAt: null })).toBeNull()
  })

  it('reports before, during and after the window', () => {
    expect(quizWindowState({ opensAt: opens, closesAt: closes }, opens.toMillis() - 1)).toBe('not_open_yet')
    expect(quizWindowState({ opensAt: opens, closesAt: closes }, opens.toMillis())).toBe('open')
    expect(quizWindowState({ opensAt: opens, closesAt: closes }, closes.toMillis())).toBe('open')
    expect(quizWindowState({ opensAt: opens, closesAt: closes }, closes.toMillis() + 1)).toBe('closed')
  })

  it('requires the deadline to be after the opening time', () => {
    expect(timingProblem({ timeLimitMinutes: null, opensAt: closes, closesAt: opens })).toMatch(/after/)
    expect(timingProblem({ timeLimitMinutes: null, opensAt: opens, closesAt: closes })).toBeNull()
  })

  it('round-trips a local date and time', () => {
    const value = '2026-10-20T14:30'
    expect(toDateTimeLocal(fromDateTimeLocal(value))).toBe(value)
    expect(fromDateTimeLocal('')).toBeNull()
  })
})

describe('attempt countdown', () => {
  it('ends at the time limit or the deadline, whichever is first', () => {
    expect(attemptEndMs(1_000, 60, null)).toBe(61_000)
    expect(attemptEndMs(1_000, null, 5_000)).toBe(5_000)
    expect(attemptEndMs(1_000, 60, 30_000)).toBe(30_000)
    expect(attemptEndMs(1_000, 60, 500_000)).toBe(61_000)
    expect(attemptEndMs(1_000, null, null)).toBeNull()
  })

  it('never counts below zero', () => {
    expect(secondsUntil(10_000, 4_500)).toBe(6)
    expect(secondsUntil(10_000, 20_000)).toBe(0)
  })
})

describe('parseQuizSettings with the new timing fields', () => {
  it('treats older settings without the new fields as unset', () => {
    const { timeLimitSeconds, opensAt, closesAt, ...older } = defaultQuizSettings('quiz')
    void timeLimitSeconds; void opensAt; void closesAt
    expect(parseQuizSettings({ ...older, timeLimitMinutes: 5 }, 'quiz')).toMatchObject({ timeLimitMinutes: 5, timeLimitSeconds: null, opensAt: null, closesAt: null })
  })

  it('keeps seconds, opening time and deadline', () => {
    const opens = at('2026-10-20T08:00:00Z')
    const closes = at('2026-10-20T10:00:00Z')
    const parsed = parseQuizSettings({ ...defaultQuizSettings('quiz'), ...timeLimitFields(90), opensAt: opens, closesAt: closes }, 'quiz')
    expect(parsed).toMatchObject({ timeLimitMinutes: 2, timeLimitSeconds: 90 })
    expect(parsed.opensAt?.toMillis()).toBe(opens.toMillis())
    expect(parsed.closesAt?.toMillis()).toBe(closes.toMillis())
  })

  it('rejects a deadline that is not after the opening time', () => {
    expect(() => parseQuizSettings({ ...defaultQuizSettings('quiz'), opensAt: at('2026-10-20T10:00:00Z'), closesAt: at('2026-10-20T08:00:00Z') }, 'quiz')).toThrow(/deadline/)
  })

  it('rejects a time limit under 10 seconds', () => {
    expect(() => parseQuizSettings({ ...defaultQuizSettings('quiz'), timeLimitMinutes: 1, timeLimitSeconds: 5 }, 'quiz')).toThrow(/at least 10 seconds/)
  })
})
