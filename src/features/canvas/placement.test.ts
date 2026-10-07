import { describe, expect, it } from 'vitest'
import {
  CANVAS_CARD_HEIGHT,
  CANVAS_CARD_PADDING,
  CANVAS_CARD_WIDTH,
  CANVAS_EDGE_STROKE_WIDTH,
  CANVAS_HANDLE_DOT_SIZE,
  CANVAS_HANDLE_HIT_SIZE,
  CANVAS_MINIMAP_HEIGHT,
  CANVAS_MINIMAP_WIDTH,
  CANVAS_SELECTION_OUTLINE_WIDTH,
} from './constants'
import {
  findNonOverlappingPosition,
  isPositionOverlapping,
  tidyLayout,
} from './placement'
import type { CanvasCard } from './types'

describe('canvas constants', () => {
  it('defines the required card, handle, edge, and minimap dimensions', () => {
    expect(CANVAS_CARD_WIDTH).toBe(240)
    expect(CANVAS_CARD_HEIGHT).toBe(140)
    expect(CANVAS_CARD_PADDING).toBe(40)
    expect(CANVAS_HANDLE_DOT_SIZE).toBe(28)
    expect(CANVAS_HANDLE_HIT_SIZE).toBe(44)
    expect(CANVAS_EDGE_STROKE_WIDTH).toBe(2.5)
    expect(CANVAS_SELECTION_OUTLINE_WIDTH).toBe(3)
    expect(CANVAS_MINIMAP_WIDTH).toBe(200)
    expect(CANVAS_MINIMAP_HEIGHT).toBe(140)
  })
})

describe('tidyLayout', () => {
  it('returns empty array when cards list is empty', () => {
    expect(tidyLayout([])).toEqual([])
  })

  it('arranges multiple cards in a non-overlapping grid', () => {
    const cards: CanvasCard[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      type: 'note',
      content: `Card ${i}`,
      position: { x: 0, y: 0 },
    }))

    const tidied = tidyLayout(cards, { cols: 3, startX: 50, startY: 50 })
    expect(tidied).toHaveLength(6)

    // Check positions of each card
    expect(tidied[0]?.position).toEqual({ x: 50, y: 50 })
    expect(tidied[1]?.position).toEqual({ x: 50 + 280, y: 50 })
    expect(tidied[2]?.position).toEqual({ x: 50 + 560, y: 50 })
    expect(tidied[3]?.position).toEqual({ x: 50, y: 50 + 180 })

    // Verify no two cards overlap
    for (let i = 0; i < tidied.length; i++) {
      for (let j = i + 1; j < tidied.length; j++) {
        const c1 = tidied[i]!
        const c2 = tidied[j]!
        const overlapX =
          c1.position.x < c2.position.x + CANVAS_CARD_WIDTH &&
          c1.position.x + CANVAS_CARD_WIDTH > c2.position.x
        const overlapY =
          c1.position.y < c2.position.y + CANVAS_CARD_HEIGHT &&
          c1.position.y + CANVAS_CARD_HEIGHT > c2.position.y
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })
})

describe('findNonOverlappingPosition', () => {
  it('returns base position for the first card', () => {
    const pos = findNonOverlappingPosition([])
    expect(pos).toEqual({ x: 40, y: 40 })

    const centered = findNonOverlappingPosition([], { x: 500, y: 400 })
    expect(centered).toEqual({
      x: 500 - CANVAS_CARD_WIDTH / 2,
      y: 400 - CANVAS_CARD_HEIGHT / 2,
    })
  })

  it('never places a new card on top of an existing card', () => {
    const existing: CanvasCard[] = [
      { id: '1', type: 'note', content: '1', position: { x: 100, y: 100 } },
      { id: '2', type: 'note', content: '2', position: { x: 380, y: 100 } },
    ]

    // Attempting to place at (100, 100) must yield a non-overlapping coordinate
    const newPos = findNonOverlappingPosition(existing, {
      x: 100 + CANVAS_CARD_WIDTH / 2,
      y: 100 + CANVAS_CARD_HEIGHT / 2,
    })
    expect(isPositionOverlapping(newPos.x, newPos.y, existing)).toBe(false)
  })
})
