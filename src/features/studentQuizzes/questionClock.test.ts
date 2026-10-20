import { describe, expect, it } from 'vitest'
import { resumeQuestionClock } from './quizLogic'
import { isTimeLow } from './QuestionTimer'

describe('per-question countdown', () => {
  const limit = 60
  const start = 1_000_000

  it('starts the first question at the moment the attempt started', () => {
    expect(resumeQuestionClock(undefined, limit, 3, start, start + 10_000)).toEqual({ index: 0, startedAtMs: start, finished: false })
  })

  it('moves to the next question when its time runs out and gives it a full countdown', () => {
    expect(resumeQuestionClock({ index: 0, startedAtMs: start }, limit, 3, start, start + 61_000)).toEqual({ index: 1, startedAtMs: start + 60_000, finished: false })
  })

  it('skips every question whose time passed while the student was away', () => {
    expect(resumeQuestionClock({ index: 0, startedAtMs: start }, limit, 5, start, start + 130_000)).toEqual({ index: 2, startedAtMs: start + 120_000, finished: false })
  })

  it('keeps a saved clock when the student moved on early', () => {
    const saved = { index: 1, startedAtMs: start + 20_000 }
    expect(resumeQuestionClock(saved, limit, 3, start, start + 50_000)).toEqual({ index: 1, startedAtMs: start + 20_000, finished: false })
  })

  it('finishes once the last question runs out of time', () => {
    const result = resumeQuestionClock({ index: 2, startedAtMs: start + 120_000 }, limit, 3, start, start + 181_000)
    expect(result.finished).toBe(true)
    expect(result.index).toBe(2)
  })

  it('finishes a single-question attempt when its time is gone', () => {
    expect(resumeQuestionClock(undefined, limit, 1, start, start + 61_000).finished).toBe(true)
    expect(resumeQuestionClock(undefined, limit, 1, start, start + 59_000).finished).toBe(false)
  })
})

describe('low-time warning', () => {
  it('warns in the last fifth of the question, but never later than 5 seconds out', () => {
    expect(isTimeLow(12, 60)).toBe(true)
    expect(isTimeLow(13, 60)).toBe(false)
    expect(isTimeLow(5, 10)).toBe(true)
    expect(isTimeLow(6, 10)).toBe(false)
  })
})
