import { describe, expect, it } from 'vitest'
import { initialCardState, MAX_EASE, MAX_INTERVAL_DAYS, MIN_EASE, RELEARN_DELAY_MS, scheduleReview } from './srs'

describe('initialCardState', () => {
  it('starts with neutral scheduling state', () => {
    expect(initialCardState()).toEqual({ ease: 2.5, intervalDays: 0, due: 0, reps: 0, lapses: 0, lastGrade: null, lastReviewed: null })
  })
})

describe('scheduleReview Again', () => {
  it('relearns after ten minutes and resets repetitions and interval', () => {
    const state = scheduleReview(null, 'again', 100)
    expect(state).toMatchObject({ due: 100 + RELEARN_DELAY_MS, reps: 0, intervalDays: 0, lastGrade: 'again' })
  })
  it('does not count a lapse before the first successful review', () => {
    expect(scheduleReview(null, 'again', 100).lapses).toBe(0)
  })
  it('counts one lapse after a successful review', () => {
    expect(scheduleReview({ ...initialCardState(), reps: 1, lapses: 2 }, 'again', 100).lapses).toBe(3)
  })
  it('applies the ease floor', () => {
    expect(scheduleReview({ ...initialCardState(), ease: MIN_EASE, reps: 1 }, 'again', 100).ease).toBe(MIN_EASE)
  })
})

describe('scheduleReview Hard', () => {
  it('uses a one-day initial interval', () => {
    expect(scheduleReview(null, 'hard', 100).intervalDays).toBe(1)
  })
  it('reduces ease by 0.15', () => {
    expect(scheduleReview(null, 'hard', 100).ease).toBe(2.35)
  })
  it('grows a repeated interval by the larger minimum step', () => {
    expect(scheduleReview({ ...initialCardState(), reps: 1, intervalDays: 1 }, 'hard', 100).intervalDays).toBe(2)
  })
})

describe('scheduleReview Good', () => {
  it('uses one day on the first review', () => {
    expect(scheduleReview(null, 'good', 100).intervalDays).toBe(1)
  })
  it('uses three days on the second review', () => {
    expect(scheduleReview({ ...initialCardState(), reps: 1, intervalDays: 1 }, 'good', 100).intervalDays).toBe(3)
  })
  it('multiplies later intervals by ease and rounds to whole days', () => {
    expect(scheduleReview({ ...initialCardState(), reps: 2, intervalDays: 3 }, 'good', 100).intervalDays).toBe(8)
  })
})

describe('scheduleReview Easy', () => {
  it('uses four days on the first review and seven on the second', () => {
    expect(scheduleReview(null, 'easy', 100).intervalDays).toBe(4)
    expect(scheduleReview({ ...initialCardState(), reps: 1 }, 'easy', 100).intervalDays).toBe(7)
  })
  it('increases ease by 0.15 within the maximum', () => {
    expect(scheduleReview(null, 'easy', 100).ease).toBe(2.65)
    expect(scheduleReview({ ...initialCardState(), ease: MAX_EASE }, 'easy', 100).ease).toBe(MAX_EASE)
  })
  it('caps long intervals at the maximum', () => {
    const state = scheduleReview({ ...initialCardState(), reps: 3, intervalDays: 365, ease: 3 }, 'easy', 100)
    expect(state.intervalDays).toBe(MAX_INTERVAL_DAYS)
  })
})

describe('scheduleReview immutability and display helpers', () => {
  it('does not mutate the old scheduling state', () => {
    const previous = { ...initialCardState(), reps: 2, intervalDays: 3 }
    const snapshot = { ...previous }
    scheduleReview(previous, 'good', 9000)
    expect(previous).toEqual(snapshot)
  })
})
