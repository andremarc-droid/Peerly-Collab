import { describe, expect, it } from 'vitest'
import { emptyProgress } from './progress'
import { buildQueue, countStudyLoad, deckProgressKey } from './queue'

const deck = { classId: 'class', id: 'deck', cards: [{ id: 'a', front: 'A', back: 'one' }, { id: 'b', front: 'B', back: 'two' }, { id: 'c', front: 'C', back: 'three' }] }
describe('study queue', () => {
  it('puts most overdue first and fills the remaining new-card allowance', () => {
    const progress = { ...emptyProgress('2026-10-10'), newCount: 1, cards: {
      a: { ease: 2.5, intervalDays: 1, due: 10, reps: 1, lapses: 0, lastGrade: 'good' as const, lastReviewed: 0 },
      b: { ease: 2.5, intervalDays: 1, due: 20, reps: 1, lapses: 0, lastGrade: 'good' as const, lastReviewed: 0 },
    } }
    const result = buildQueue(deck, progress, 30, 2)
    expect(result.cards.map((card) => card.id)).toEqual(['a', 'b', 'c'])
    expect(result).toMatchObject({ dueCount: 2, newCount: 1 })
  })

  it("counts today's due and available new cards across decks", () => {
    expect(countStudyLoad([deck], {}, 0, 2)).toEqual({ due: 0, new: 2 })
    expect(deckProgressKey('class', 'deck')).toBe('class~deck')
  })

  it('does not include reviewed cards that are not due yet', () => {
    const progress = { ...emptyProgress('2026-10-10'), cards: {
      a: { ease: 2.5, intervalDays: 1, due: 99, reps: 1, lapses: 0, lastGrade: 'good' as const, lastReviewed: 0 },
    } }
    expect(buildQueue(deck, progress, 30).cards.map(card => card.id)).toEqual(['b', 'c'])
  })

  it('applies zero and negative daily limits safely', () => {
    expect(buildQueue(deck, emptyProgress('2026-10-10'), 30, 0).cards).toEqual([])
    expect(buildQueue(deck, emptyProgress('2026-10-10'), 30, -2).cards).toEqual([])
  })

  it('uses the reset progress count after a local-day change', () => {
    const progress = { ...emptyProgress('2026-10-11'), newCount: 0 }
    expect(buildQueue(deck, progress, 30, 2).newCount).toBe(2)
  })
})
