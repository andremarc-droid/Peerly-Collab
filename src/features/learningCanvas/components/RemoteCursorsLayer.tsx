import { memo } from 'react'
import type { RemoteCursor } from '../collab/types'

interface RemoteCursorsLayerProps {
  remoteCursors: RemoteCursor[]
}

/**
 * Isolated remote cursor layer. Memoized so remote cursor updates (e.g. nowMs ticks or
 * incoming presence updates) do not trigger reconciliation of the entire whiteboard.
 */
export const RemoteCursorsLayer = memo(function RemoteCursorsLayer({
  remoteCursors,
}: RemoteCursorsLayerProps) {
  if (remoteCursors.length === 0) return null

  return (
    <svg className="learning-canvas-cursors" aria-hidden="false">
      {remoteCursors.map((cursor) => (
        <g
          key={cursor.uid}
          className="learning-canvas-cursor"
          transform={`translate(${cursor.x} ${cursor.y})`}
          role="img"
          aria-label={`${cursor.name} cursor`}
        >
          <path
            className="learning-canvas-cursor__pointer"
            d="M 0 0 L 0 18 L 5 13 L 10 23 L 14 21 L 9 11 L 16 10 Z"
          />
          <rect
            className="learning-canvas-cursor__label"
            x="14"
            y="14"
            width={Math.max(42, cursor.name.length * 8 + 12)}
            height="22"
            rx="8"
          />
          <text className="learning-canvas-cursor__name" x="20" y="29">
            {cursor.name}
          </text>
        </g>
      ))}
    </svg>
  )
})

