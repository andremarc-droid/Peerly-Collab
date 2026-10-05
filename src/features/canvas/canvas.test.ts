import { describe, expect, it } from 'vitest'
import {
  buildCanvasDiff,
  normalizeConnection,
  parseConnectionEdge,
  scatterCards,
  validateCanvasDefinition,
  validateCanvasKey,
} from './schemas'
import type { CanvasBounds, CanvasCard, CanvasConnection } from './types'
import { DomainValidationError } from '../quizzes/schemas'

function makeCard(id: string, type: CanvasCard['type'] = 'note', content = 'Card text'): CanvasCard {
  return {
    id,
    type,
    content,
    position: { x: 0, y: 0 },
    ...(type === 'image' ? { url: 'https://drive.google.com/file/d/123/view' } : {}),
    ...(type === 'link' ? { url: 'https://example.com/info' } : {}),
  }
}

describe('normalizeConnection', () => {
  it('normalizes directed connections preserving order', () => {
    expect(normalizeConnection('card-1', 'card-2', true)).toBe('card-1->card-2')
    expect(normalizeConnection('card-2', 'card-1', true)).toBe('card-2->card-1')
  })

  it('normalizes undirected connections sorted alphabetically', () => {
    expect(normalizeConnection('beta', 'alpha', false)).toBe('alpha<->beta')
    expect(normalizeConnection('alpha', 'beta', false)).toBe('alpha<->beta')
  })

  it('trims whitespace', () => {
    expect(normalizeConnection(' card-a ', ' card-b ', true)).toBe('card-a->card-b')
    expect(normalizeConnection(' b ', ' a ', false)).toBe('a<->b')
  })
})

describe('parseConnectionEdge', () => {
  it('parses directed and undirected edge strings', () => {
    expect(parseConnectionEdge('c1->c2')).toEqual({ from: 'c1', to: 'c2' })
    expect(parseConnectionEdge('c1<->c2')).toEqual({ from: 'c1', to: 'c2' })
  })

  it('returns null for invalid edge strings', () => {
    expect(parseConnectionEdge('invalid')).toBeNull()
    expect(parseConnectionEdge('->c2')).toBeNull()
    expect(parseConnectionEdge('c1->')).toBeNull()
  })
})

describe('validateCanvasDefinition', () => {
  it('validates a complete, valid canvas question definition', () => {
    const raw = {
      type: 'canvas',
      prompt: 'Connect the cards',
      order: 0,
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        makeCard('c1', 'note', 'Note card'),
        makeCard('c2', 'paragraph', 'Detailed explanation'),
        makeCard('c3', 'image', 'Thumbnail'),
        makeCard('c4', 'link', 'Reference link'),
      ],
    }

    const validated = validateCanvasDefinition(raw)
    expect(validated.type).toBe('canvas')
    expect(validated.points).toBe(100)
    expect(validated.layoutMode).toBe('scattered')
    expect(validated.directed).toBe(true)
    expect(validated.wrongPenalty).toBe('half')
    expect(validated.cards.length).toBe(4)
  })

  it('applies defaults for points, layoutMode, directed, and wrongPenalty', () => {
    const raw = {
      type: 'canvas',
      prompt: 'Minimal board',
      cards: [makeCard('c1')],
    }
    const validated = validateCanvasDefinition(raw)
    expect(validated.points).toBe(100)
    expect(validated.layoutMode).toBe('scattered')
    expect(validated.directed).toBe(true)
    expect(validated.wrongPenalty).toBe('half')
    expect(validated.order).toBe(0)
  })

  it('rejects more than 50 cards', () => {
    const cards = Array.from({ length: 51 }, (_, i) => makeCard(`c${i}`))
    expect(() => validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards })).toThrow(DomainValidationError)
  })

  it('rejects duplicate card IDs', () => {
    const cards = [makeCard('dup'), makeCard('dup')]
    expect(() => validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards })).toThrow(/Duplicate card id/)
  })

  it('rejects card content over 1000 characters', () => {
    const cards = [makeCard('c1', 'paragraph', 'A'.repeat(1001))]
    expect(() => validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards })).toThrow(/1000 characters/)
  })

  it('enforces Google Drive URL regex for image cards', () => {
    const invalidImage = {
      id: 'c1',
      type: 'image',
      content: '',
      url: 'https://malicious.example.com/image.png',
      position: { x: 0, y: 0 },
    }
    expect(() => validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards: [invalidImage] })).toThrow(
      /Google Drive link/,
    )

    const validDrive = {
      id: 'c1',
      type: 'image',
      content: '',
      url: 'https://docs.google.com/drawings/d/xyz/preview',
      position: { x: 0, y: 0 },
    }
    expect(validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards: [validDrive] }).cards[0]?.url).toBe(
      validDrive.url,
    )
  })

  it('enforces HTTPS scheme for link cards', () => {
    const httpLink = {
      id: 'c1',
      type: 'link',
      content: '',
      url: 'http://insecure.example.com',
      position: { x: 0, y: 0 },
    }
    expect(() => validateCanvasDefinition({ type: 'canvas', prompt: 'P', cards: [httpLink] })).toThrow(/HTTPS link/)
  })
})

describe('validateCanvasKey', () => {
  const cards: CanvasCard[] = [makeCard('c1'), makeCard('c2'), makeCard('c3')]

  it('validates a valid canvas answer key', () => {
    const raw = {
      type: 'canvas',
      explanation: 'Key relationships',
      connections: [
        { id: 'conn-1', from: 'c1', to: 'c2', points: 2 },
        { id: 'conn-2', from: 'c2', to: 'c3', points: 1 },
      ],
    }
    const key = validateCanvasKey(raw, cards, true)
    expect(key.type).toBe('canvas')
    expect(key.connections.length).toBe(2)
    expect(key.connections[0]?.points).toBe(2)
    expect(key.connections[1]?.points).toBe(1)
  })

  it('defaults connection points to 1 when omitted', () => {
    const raw = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'conn-1', from: 'c1', to: 'c2' }],
    }
    const key = validateCanvasKey(raw, cards, true)
    expect(key.connections[0]?.points).toBe(1)
  })

  it('rejects self-connections', () => {
    const raw = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'conn-1', from: 'c1', to: 'c1' }],
    }
    expect(() => validateCanvasKey(raw, cards, true)).toThrow(/cannot be self-referential/)
  })

  it('rejects endpoints not present in the card list', () => {
    const raw = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'conn-1', from: 'c1', to: 'missing' }],
    }
    expect(() => validateCanvasKey(raw, cards, true)).toThrow(/Connection endpoint does not exist: missing/)
  })

  it('rejects duplicate connections for directed graphs', () => {
    const raw = {
      type: 'canvas',
      explanation: '',
      connections: [
        { id: 'conn-1', from: 'c1', to: 'c2' },
        { id: 'conn-2', from: 'c1', to: 'c2' },
      ],
    }
    expect(() => validateCanvasKey(raw, cards, true)).toThrow(/Duplicate connection/)
  })

  it('rejects reverse duplicates for undirected graphs', () => {
    const raw = {
      type: 'canvas',
      explanation: '',
      connections: [
        { id: 'conn-1', from: 'c1', to: 'c2' },
        { id: 'conn-2', from: 'c2', to: 'c1' },
      ],
    }
    expect(() => validateCanvasKey(raw, cards, false)).toThrow(/Duplicate connection/)
  })

  it('rejects more than 80 connections', () => {
    const connections: CanvasConnection[] = Array.from({ length: 81 }, (_, i) => ({
      id: `conn-${i}`,
      from: 'c1',
      to: 'c2',
    }))
    expect(() => validateCanvasKey({ type: 'canvas', connections })).toThrow(/80 items/)
  })
})

describe('scatterCards', () => {
  const bounds: CanvasBounds = {
    width: 2000,
    height: 1500,
    cardWidth: 180,
    cardHeight: 100,
    padding: 20,
  }

  function doBoxesOverlap(
    c1: CanvasCard,
    c2: CanvasCard,
    width = bounds.cardWidth ?? 180,
    height = bounds.cardHeight ?? 100,
  ): boolean {
    const r1 = { left: c1.position.x, right: c1.position.x + width, top: c1.position.y, bottom: c1.position.y + height }
    const r2 = { left: c2.position.x, right: c2.position.x + width, top: c2.position.y, bottom: c2.position.y + height }
    return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom)
  }

  function verifyScatter(cards: CanvasCard[]) {
    // Check no pair overlaps
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const overlaps = doBoxesOverlap(cards[i]!, cards[j]!)
        expect(overlaps).toBe(false)
      }
    }
    // Check bounds
    for (const card of cards) {
      expect(card.position.x).toBeGreaterThanOrEqual(0)
      expect(card.position.y).toBeGreaterThanOrEqual(0)
    }
  }

  it('is deterministic for the same seed and input', () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`card-${i}`))
    const resultA = scatterCards(cards, 'biology-seed-1', bounds)
    const resultB = scatterCards(cards, 'biology-seed-1', bounds)
    expect(resultA.map((c) => c.position)).toEqual(resultB.map((c) => c.position))

    const resultC = scatterCards(cards, 'different-seed-2', bounds)
    expect(resultA.map((c) => c.position)).not.toEqual(resultC.map((c) => c.position))
  })

  it('scatters 1 card with non-overlapping bounds check', () => {
    const cards = [makeCard('single')]
    const scattered = scatterCards(cards, 42, bounds)
    expect(scattered.length).toBe(1)
    verifyScatter(scattered)
  })

  it('scatters 10 cards with zero overlap', () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`))
    const scattered = scatterCards(cards, 12345, bounds)
    expect(scattered.length).toBe(10)
    verifyScatter(scattered)
  })

  it('scatters 50 cards with zero overlap', () => {
    const cards = Array.from({ length: 50 }, (_, i) => makeCard(`card-50-${i}`))
    const scattered = scatterCards(cards, 'big-board-seed', bounds)
    expect(scattered.length).toBe(50)
    verifyScatter(scattered)
  })

  it('returns empty array when cards array is empty', () => {
    expect(scatterCards([], 1, bounds)).toEqual([])
  })
})

describe('buildCanvasDiff', () => {
  const keyConnections: CanvasConnection[] = [
    { id: '1', from: 'a', to: 'b' },
    { id: '2', from: 'b', to: 'c' },
    { id: '3', from: 'c', to: 'd' },
  ]

  it('accurately identifies correct, missed, and wrong connections (directed)', () => {
    // Student connects a->b (correct), b->a (wrong, wrong direction), d->e (wrong, unknown card)
    const student = ['a->b', 'b->a', 'd->e']
    const diff = buildCanvasDiff(student, keyConnections, true)

    expect(diff.correct).toEqual(['a->b'])
    expect(diff.wrong).toEqual(['b->a', 'd->e'])
    expect(diff.missed).toEqual(['b->c', 'c->d'])
  })

  it('supports undirected matching', () => {
    const student = ['b->a', 'c->b']
    const diff = buildCanvasDiff(student, keyConnections, false)

    expect(diff.correct).toEqual(['a<->b', 'b<->c'])
    expect(diff.wrong).toEqual([])
    expect(diff.missed).toEqual(['c<->d'])
  })

  it('ignores duplicate submissions and self-connections', () => {
    const student = ['a->b', 'a->b', 'a->a', 'x->y']
    const diff = buildCanvasDiff(student, keyConnections, true)

    expect(diff.correct).toEqual(['a->b'])
    expect(diff.wrong).toEqual(['x->y'])
    expect(diff.missed).toEqual(['b->c', 'c->d'])
  })

  it('enforces connection cap: min(80, 2 x key count)', () => {
    // keyConnections.length = 3 => cap = 6
    const student = ['a->b', 'w1->w2', 'w2->w3', 'w3->w4', 'w4->w5', 'w5->w6', 'w6->w7', 'w7->w8']
    const diff = buildCanvasDiff(student, keyConnections, true)

    // First is correct, next 5 are wrong (total 6 capped), 7th and 8th ignored
    expect(diff.correct.length).toBe(1)
    expect(diff.wrong.length).toBe(5)
  })
})
