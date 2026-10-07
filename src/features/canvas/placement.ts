import {
  CANVAS_CARD_HEIGHT,
  CANVAS_CARD_WIDTH,
  CANVAS_GRID_GAP_X,
  CANVAS_GRID_GAP_Y,
  CANVAS_SLOT_HEIGHT,
  CANVAS_SLOT_WIDTH,
} from './constants'
import type { CanvasCard } from './types'

export interface TidyLayoutOptions {
  cols?: number
  startX?: number
  startY?: number
}

/**
 * Arranges a list of cards in a clean grid using the standard card dimensions and spacing.
 * Ensures zero overlap between any placed cards.
 */
export function tidyLayout(cards: CanvasCard[], options?: TidyLayoutOptions): CanvasCard[] {
  if (cards.length === 0) return []

  const startX = options?.startX ?? 40
  const startY = options?.startY ?? 40
  const cols = options?.cols ?? Math.max(1, Math.ceil(Math.sqrt(cards.length * 1.5)))

  return cards.map((card, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = startX + col * CANVAS_SLOT_WIDTH
    const y = startY + row * CANVAS_SLOT_HEIGHT

    return {
      ...card,
      position: { x, y },
    }
  })
}

/**
 * Checks whether a candidate card box (x, y, CANVAS_CARD_WIDTH, CANVAS_CARD_HEIGHT)
 * overlaps with any existing card box. Includes CANVAS_GRID_GAP padding to prevent touching.
 */
export function isPositionOverlapping(
  x: number,
  y: number,
  existingCards: CanvasCard[],
  padX: number = CANVAS_GRID_GAP_X / 2,
  padY: number = CANVAS_GRID_GAP_Y / 2,
): boolean {
  for (const card of existingCards) {
    const cx = card.position?.x ?? 0
    const cy = card.position?.y ?? 0

    const xOverlap = x < cx + CANVAS_CARD_WIDTH + padX && x + CANVAS_CARD_WIDTH + padX > cx
    const yOverlap = y < cy + CANVAS_CARD_HEIGHT + padY && y + CANVAS_CARD_HEIGHT + padY > cy

    if (xOverlap && yOverlap) {
      return true
    }
  }
  return false
}

/**
 * Finds a free, non-overlapping position for a new card.
 * If a viewport center is supplied, searches outward in concentric grid rings from the center.
 * If no center is provided, searches in a row/column grid starting at (40, 40).
 */
export function findNonOverlappingPosition(
  existingCards: CanvasCard[],
  preferredCenter?: { x: number; y: number },
): { x: number; y: number } {
  if (existingCards.length === 0) {
    if (preferredCenter) {
      return {
        x: Math.round(preferredCenter.x - CANVAS_CARD_WIDTH / 2),
        y: Math.round(preferredCenter.y - CANVAS_CARD_HEIGHT / 2),
      }
    }
    return { x: 40, y: 40 }
  }

  const baseX = preferredCenter
    ? Math.round((preferredCenter.x - CANVAS_CARD_WIDTH / 2) / CANVAS_SLOT_WIDTH) * CANVAS_SLOT_WIDTH
    : 40
  const baseY = preferredCenter
    ? Math.round((preferredCenter.y - CANVAS_CARD_HEIGHT / 2) / CANVAS_SLOT_HEIGHT) * CANVAS_SLOT_HEIGHT
    : 40

  // Check direct base first
  if (!isPositionOverlapping(baseX, baseY, existingCards)) {
    return { x: baseX, y: baseY }
  }

  // Spiral search outwards in grid steps
  const maxRadius = Math.max(10, Math.ceil(Math.sqrt(existingCards.length + 1) * 2))
  for (let r = 1; r <= maxRadius; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue // only check outer ring

        const candidateX = baseX + dx * CANVAS_SLOT_WIDTH
        const candidateY = baseY + dy * CANVAS_SLOT_HEIGHT

        if (!isPositionOverlapping(candidateX, candidateY, existingCards)) {
          return { x: candidateX, y: candidateY }
        }
      }
    }
  }

  // Fallback to placed after furthest card
  const maxX = Math.max(...existingCards.map((c) => c.position?.x ?? 0), 0)
  return { x: maxX + CANVAS_SLOT_WIDTH, y: baseY }
}
