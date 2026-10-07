import { useReactFlow } from '@xyflow/react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import {
  CANVAS_FIT_VIEW_MAX_ZOOM,
  CANVAS_FIT_VIEW_MIN_ZOOM,
  CANVAS_FIT_VIEW_PADDING,
} from '../constants'

interface CanvasControlsProps {
  connectCardsDialogSlot?: React.ReactNode
}

/**
 * Accessible control buttons adhering to the 44px touch target requirement
 * and white/navy theme tokens.
 */
export function CanvasControls({ connectCardsDialogSlot }: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow()

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
        className="canvas-controls-button font-semibold text-xs text-navy-900"
        onClick={() => zoomTo(1, { duration: 200 })}
        aria-label="Reset zoom to 100%"
        title="Zoom to 100%"
      >
        100%
      </button>
      <button
        type="button"
        className="canvas-controls-button"
        onClick={() =>
          fitView({
            duration: 300,
            padding: CANVAS_FIT_VIEW_PADDING,
            maxZoom: CANVAS_FIT_VIEW_MAX_ZOOM,
            minZoom: CANVAS_FIT_VIEW_MIN_ZOOM,
          })
        }
        aria-label="Fit all cards in view"
        title="Fit view"
      >
        <Maximize2 size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
