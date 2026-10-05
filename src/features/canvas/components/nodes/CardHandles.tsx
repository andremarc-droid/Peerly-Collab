import { Handle, Position } from '@xyflow/react'

interface CardHandlesProps {
  isConnectable?: boolean
}

/**
 * Renders 4 connection handles (Top, Right, Bottom, Left) with at least 24px hit areas,
 * visible on hover, focus-within, and touch.
 */
export function CardHandles({ isConnectable = true }: CardHandlesProps) {
  return (
    <>
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        isConnectable={isConnectable}
        className="canvas-handle canvas-handle--top"
        aria-label="Connect from top"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={isConnectable}
        className="canvas-handle canvas-handle--right"
        aria-label="Connect from right"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={isConnectable}
        className="canvas-handle canvas-handle--bottom"
        aria-label="Connect from bottom"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        isConnectable={isConnectable}
        className="canvas-handle canvas-handle--left"
        aria-label="Connect from left"
      />
    </>
  )
}
