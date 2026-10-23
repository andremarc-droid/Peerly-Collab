import { describe, it, expect } from 'vitest'
import { matchesPublicDeck, parseTags, sanitizeTag, validatePublicCards } from './schemas'
import type { PublicDeck } from './types'

describe('publicDecks schemas and pure logic', () => {
  it('sanitizes and parses tags up to 5 items', () => {
    expect(sanitizeTag('  Biology#1! ')).toBe('biology1')
    expect(parseTags('biology, cells, anatomy, dna, rna, extra')).toEqual([
      'biology',
      'cells',
      'anatomy',
      'dna',
      'rna',
    ])
    expect(parseTags('a b')).toEqual([]) // drops single character tags
  })

  it('validates cards for public decks correctly', () => {
    expect(validatePublicCards([])).toEqual({
      valid: false,
      error: 'A deck must have at least 1 card to be published.',
    })

    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      id: `c-${i}`,
      front: 'Front',
      back: 'Back',
    }))
    expect(validatePublicCards(tooMany).valid).toBe(false)

    expect(
      validatePublicCards([
        { id: '1', front: 'Valid front', back: 'Valid back' },
      ]),
    ).toEqual({ valid: true })

    expect(
      validatePublicCards([
        { id: '1', front: '', back: 'Back' },
      ]).valid,
    ).toBe(false)

    expect(
      validatePublicCards([
        { id: '1', front: 'a'.repeat(301), back: 'Back' },
      ]).valid,
    ).toBe(false)
  })

  it('filters public decks by search term and tag correctly', () => {
    const mockDeck: PublicDeck = {
      id: 'deck-1',
      ownerId: 'user-1',
      authorDisplayName: 'Teacher Alice',
      title: 'Cell Biology 101',
      description: 'Introduction to plant and animal cells',
      tags: ['biology', 'cells'],
      cardCount: 10,
      cards: [],
      savesCount: 15,
      publishedAt: {} as any,
      updatedAt: {} as any,
    }

    expect(matchesPublicDeck(mockDeck, 'cell')).toBe(true)
    expect(matchesPublicDeck(mockDeck, 'Alice')).toBe(true)
    expect(matchesPublicDeck(mockDeck, '', 'biology')).toBe(true)
    expect(matchesPublicDeck(mockDeck, '', 'chemistry')).toBe(false)
    expect(matchesPublicDeck(mockDeck, 'physics')).toBe(false)
  })
})
