import { CANVAS_CARD_HEIGHT, CANVAS_CARD_WIDTH } from './constants'

/**
 * Computes optimal handle identifiers ('top', 'right', 'bottom', 'left')
 * between two card coordinates based on their relative positions.
 */
export function getOptimalHandles(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const fromCenterX = fromPos.x + CANVAS_CARD_WIDTH / 2
  const fromCenterY = fromPos.y + CANVAS_CARD_HEIGHT / 2
  const toCenterX = toPos.x + CANVAS_CARD_WIDTH / 2
  const toCenterY = toPos.y + CANVAS_CARD_HEIGHT / 2

  const dx = toCenterX - fromCenterX
  const dy = toCenterY - fromCenterY

  const normX = dx / CANVAS_CARD_WIDTH
  const normY = dy / CANVAS_CARD_HEIGHT

  if (Math.abs(normY) >= Math.abs(normX)) {
    if (dy >= 0) {
      return { sourceHandle: 'bottom', targetHandle: 'top' }
    } else {
      return { sourceHandle: 'top', targetHandle: 'bottom' }
    }
  } else {
    if (dx >= 0) {
      return { sourceHandle: 'right', targetHandle: 'left' }
    } else {
      return { sourceHandle: 'left', targetHandle: 'right' }
    }
  }
}
