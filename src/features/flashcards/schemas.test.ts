import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { parseBulkCards } from './bulkParse'
import { MAX_CARD_FRONT_LENGTH, MAX_DECK_CARDS } from './constants'
import {
  cleanDeckText,
  FlashcardValidationError,
  parseFlashcardDeck,
  prepareCards,
} from './schemas'

const now = Timestamp.now()

function validDeck(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: 'owner',
    classId: 'class-a',
    kind: 'class',
    title: 'Cell biology',
    description: '',
    status: 'draft',
    cardCount: 1,
    cards: [{ id: 'c1', front: 'Mitochondria', back: 'Powerhouse of the cell' }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('prepareCards', () => {
  it('trims text and drops fully blank rows', () => {
    const cards = prepareCards([
      { id: 'a', front: '  Term ', back: ' Definition  ' },
      { id: 'b', front: '   ', back: '' },
    ])
    expect(cards).toEqual([{ id: 'a', front: 'Term', back: 'Definition' }])
  })

  it('rejects half-filled rows with the row number', () => {
    expect(() =>
      prepareCards([
        { id: 'a', front: 'ok', back: 'ok' },
        { id: 'b', front: 'only front', back: '' },
      ]),
    ).toThrow('Card 2 needs both a front and a back.')
  })

  it('requires at least one real card', () => {
    expect(() => prepareCards([{ id: 'a', front: '', back: '' }])).toThrow(
      FlashcardValidationError,
    )
  })

  it('enforces length and deck size limits', () => {
    expect(() =>
      prepareCards([{ id: 'a', front: 'x'.repeat(MAX_CARD_FRONT_LENGTH + 1), back: 'y' }]),
    ).toThrow(/front cannot exceed/)

    const tooMany = Array.from({ length: MAX_DECK_CARDS + 1 }, (_, i) => ({
      id: `c${i}`,
      front: `q${i}`,
      back: `a${i}`,
    }))
    expect(() => prepareCards(tooMany)).toThrow(/cannot exceed/)
  })

  it('regenerates duplicate card ids', () => {
    const cards = prepareCards([
      { id: 'same', front: 'a', back: 'b' },
      { id: 'same', front: 'c', back: 'd' },
    ])
    expect(new Set(cards.map((c) => c.id)).size).toBe(2)
  })
})

describe('cleanDeckText', () => {
  it('requires a title and trims both fields', () => {
    expect(cleanDeckText('  Bio  ', '  notes ')).toEqual({ title: 'Bio', description: 'notes' })
    expect(() => cleanDeckText('   ', '')).toThrow('Give your deck a title.')
  })
})

describe('parseFlashcardDeck', () => {
  it('accepts a valid class deck', () => {
    expect(parseFlashcardDeck(validDeck()).cards).toHaveLength(1)
  })

  it('enforces status per kind', () => {
    expect(() => parseFlashcardDeck(validDeck({ kind: 'personal', status: 'published' }))).toThrow()
    expect(() => parseFlashcardDeck(validDeck({ kind: 'class', status: 'private' }))).toThrow()
    expect(parseFlashcardDeck(validDeck({ kind: 'personal', status: 'private' })).kind).toBe(
      'personal',
    )
  })

  it('rejects mismatched cardCount and duplicate card ids', () => {
    expect(() => parseFlashcardDeck(validDeck({ cardCount: 2 }))).toThrow(/cardCount/)
    expect(() =>
      parseFlashcardDeck(
        validDeck({
          cardCount: 2,
          cards: [
            { id: 'x', front: 'a', back: 'b' },
            { id: 'x', front: 'c', back: 'd' },
          ],
        }),
      ),
    ).toThrow(/unique/)
  })
})

describe('parseBulkCards', () => {
  it('parses :: and tab separated lines and skips bad ones', () => {
    const result = parseBulkCards(
      ['Term :: Definition', 'Tab\tSeparated', '', 'no separator', ':: missing front'].join('\n'),
    )
    expect(result.cards.map((c) => [c.front, c.back])).toEqual([
      ['Term', 'Definition'],
      ['Tab', 'Separated'],
    ])
    expect(result.skipped).toBe(2)
  })

  it('splits on the first separator only and handles CRLF', () => {
    const result = parseBulkCards('Ratio :: a :: b\r\nNext :: card')
    expect(result.cards[0]).toMatchObject({ front: 'Ratio', back: 'a :: b' })
    expect(result.cards).toHaveLength(2)
  })
})
