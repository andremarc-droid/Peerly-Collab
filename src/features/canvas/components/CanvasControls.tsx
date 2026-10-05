import { useReactFlow } from '@xyflow/react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'

interface CanvasControlsProps {
  connectCardsDialogSlot?: React.ReactNode
}

/**
 * Accessible control buttons adhering to the 44px touch target requirement
 * and white/navy theme tokens.
 */
export function CanvasControls({ connectCardsDialogSlot }: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-2" role="toolbar" aria-label="Canvas controls">
      {connectCardsDialogSlot}
      <button
        type="button"
        className="canvas-controls-button"
        onClick={() => zoomIn({ duration: 200 })}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="canvas-controls-button"
        onClick={() => zoomOut({ duration: 200 })}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOut size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="canvas-controls-button"
        onClick={() => fitView({ duration: 300, padding: 0.15 })}
        aria-label="Fit all cards in view"
        title="Fit view"
      >
        <Maximize2 size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
