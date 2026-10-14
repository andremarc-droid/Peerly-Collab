import { Maximize2, Minimize2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface ExpandableCanvasContainerProps {
  children: React.ReactNode
  title?: string
  className?: string
  toolbarSlot?: React.ReactNode
}

/**
 * Responsive container for canvas boards supporting:
 * - Desktop max-w ~1600px, height max(560px, calc(100dvh - 220px))
 * - Mobile/tablet height max(70dvh, 480px)
 * - Expand board button using Fullscreen API with fixed inset-0 fallback
 * - Body scroll lock, Escape key support, and reachable drawer/controls
 */
export function ExpandableCanvasContainer({
  children,
  title,
  className = '',
  toolbarSlot,
}: ExpandableCanvasContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // Listen to browser fullscreen changes to stay in sync
  useEffect(() => {
    function handleFullscreenChange() {
      const isFs = Boolean(document.fullscreenElement && document.fullscreenElement === containerRef.current)
      if (!isFs && isExpanded) {
        setIsExpanded(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [isExpanded])

  const handleToggleExpand = useCallback(async (targetExpanded?: boolean) => {
    const nextState = targetExpanded ?? !isExpanded

    if (nextState) {
      setIsExpanded(true)
      if (containerRef.current?.requestFullscreen && !document.fullscreenElement) {
        try {
          await containerRef.current.requestFullscreen()
        } catch {
          // Fallback overlay will render via isExpanded state
        }
      }
    } else {
      setIsExpanded(false)
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen()
        } catch {
          // ignore
        }
      }
    }
  }, [isExpanded])

  // Lock body scroll and listen for Escape key when expanded
  useEffect(() => {
    if (!isExpanded) return undefined

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        void handleToggleExpand(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isExpanded, handleToggleExpand])

  return (
    <div
      ref={containerRef}
      className={`w-full ${
        isExpanded
          ? 'fixed inset-0 z-50 bg-white p-3 sm:p-5 flex flex-col h-dvh overflow-hidden'
          : `relative max-w-[1600px] mx-auto ${className}`
      }`}
      data-testid="expandable-canvas-container"
      data-expanded={isExpanded ? 'true' : 'false'}
    >
      {/* Top action bar with title, custom slots, and Expand/Collapse button */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 z-10 shrink-0">
        <div className="flex items-center gap-2">
          {title && <span className="text-sm font-semibold text-navy-900">{title}</span>}
          {toolbarSlot}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => void handleToggleExpand()}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl text-sm font-semibold text-navy-900 bg-white border border-navy-900-20 shadow-sm hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800 transition-colors"
            aria-label={isExpanded ? 'Exit full screen board' : 'Expand board to full screen'}
            title={isExpanded ? 'Exit full screen (Esc)' : 'Expand board'}
          >
            {isExpanded ? (
              <>
                <Minimize2 size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Exit full screen</span>
              </>
            ) : (
              <>
                <Maximize2 size={16} aria-hidden="true" />
                <span>Expand board</span>
              </>
            )}
          </button>

          {isExpanded && (
            <button
              type="button"
              onClick={() => void handleToggleExpand(false)}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-xl text-navy-900 hover:bg-navy-900-12 focus:outline-none focus:ring-2 focus:ring-navy-800 transition-colors"
              aria-label="Close full screen view"
              title="Close (Esc)"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area (Board + Side Drawer/Outline) */}
      <div
        className={`canvas-stage relative w-full flex-1 min-h-0 flex flex-col lg:flex-row gap-4 items-stretch ${
          isExpanded
            ? 'h-[calc(100dvh-80px)]'
            : 'h-[max(70dvh,480px)] lg:h-[max(560px,calc(100dvh-220px))]'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
