import { describe, expect, it } from 'vitest'
import { summarizeDeckChanges } from './activity'
import type { FlashcardDeckRecord } from './types'

const base = {
  title: 'Biology',
  description: '',
  cards: [
    { id: 'a', front: 'Cell', back: 'Basic unit of life' },
    { id: 'b', front: 'Nucleus', back: 'Contains DNA' },
  ],
} satisfies Pick<FlashcardDeckRecord, 'title' | 'description' | 'cards'>

describe('summarizeDeckChanges', () => {
  it('identifies changed, added, and removed cards', () => {
    expect(summarizeDeckChanges(base, {
      ...base,
      cards: [
        { id: 'a', front: 'Cell', back: 'Smallest unit of life' },
        { id: 'c', front: 'Mitochondria', back: 'Produces energy' },
      ],
    })).toBe('Edited “Cell”; Added “Mitochondria”; Removed “Nucleus”')
  })

  it('reports title and description changes', () => {
    expect(summarizeDeckChanges(base, {
      ...base,
      title: 'Cell biology',
      description: 'Terms for class',
    })).toBe('Renamed the deck to “Cell biology”; Updated the deck description')
  })

  it('reports unchanged saves and bounds activity text', () => {
    expect(summarizeDeckChanges(base, base)).toBe('Saved the deck without changing its content')
    const manyChanges = Array.from({ length: 10 }, (_, index) => ({
      id: `new-${index}`,
      front: `Question ${index}`,
      back: 'Answer',
    }))
    const summary = summarizeDeckChanges(base, { ...base, cards: manyChanges })
    expect(summary.length).toBeLessThanOrEqual(200)
    expect(summary).toContain('more changes')
  })
})
