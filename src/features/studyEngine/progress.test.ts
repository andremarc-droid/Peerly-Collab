import { describe, expect, it } from 'vitest'
import { emptyProgress, MAX_PROGRESS_CARDS, parseDeckProgress, ProgressLimitError, pruneProgress, recordGrade } from './progress'

const today = '2026-10-10'
describe('deck progress', () => {
  it('drops malformed entries and clamps valid values', () => {
    const parsed = parseDeckProgress({ version: 8, newDay: today, newCount: 500, cards: { good: { ease: 9, intervalDays: 999, due: 5, reps: 3, lapses: 0, lastGrade: 'good', lastReviewed: 1 }, bad: { ease: 'x' } } }, today)
    expect(parsed.newCount).toBe(MAX_PROGRESS_CARDS)
    expect(parsed.cards.good.ease).toBe(3.2)
    expect(parsed.cards.good.intervalDays).toBe(365)
    expect(parsed.cards.bad).toBeUndefined()
  })

  it('returns empty progress for malformed top-level stored values', () => {
    expect(parseDeckProgress(null, today)).toEqual(emptyProgress(today))
    expect(parseDeckProgress({ cards: 'bad', newDay: today, newCount: 2 }, today)).toEqual(emptyProgress(today))
  })

  it('resets the new-card count when the local day changes', () => {
    const yesterday = { ...emptyProgress('2026-10-09'), newCount: 20 }
    expect(parseDeckProgress(yesterday, today)).toMatchObject({ newDay: today, newCount: 0 })
  })

  it('keeps the source progress unchanged when pruning deleted cards', () => {
    const progress = recordGrade(emptyProgress(today), 'keep', 'good', 10, today)
    const withDeleted = recordGrade(progress, 'deleted', 'good', 11, today)
    const pruned = pruneProgress(withDeleted, ['keep'])
    expect(Object.keys(withDeleted.cards)).toHaveLength(2)
    expect(Object.keys(pruned.cards)).toEqual(['keep'])
  })

  it('counts new cards once per local day and resets on the next day', () => {
    const first = recordGrade(emptyProgress(today), 'a', 'good', 1, today)
    expect(first.newCount).toBe(1)
    expect(recordGrade(first, 'a', 'easy', 2, today).newCount).toBe(1)
    expect(recordGrade(first, 'b', 'good', 3, '2026-10-11').newCount).toBe(1)
  })

  it('enforces the size cap and prunes deleted cards', () => {
    const cards = Object.fromEntries(Array.from({ length: MAX_PROGRESS_CARDS }, (_, i) => [`c${i}`, { ease: 2.5, intervalDays: 0, due: 0, reps: 0, lapses: 0, lastGrade: null, lastReviewed: null }]))
    expect(() => recordGrade({ ...emptyProgress(today), cards }, 'new', 'good', 1, today)).toThrow(ProgressLimitError)
    expect(Object.keys(pruneProgress({ ...emptyProgress(today), cards }, ['c1']).cards)).toEqual(['c1'])
  })
})
