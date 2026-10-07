import { useState, useCallback } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { ArrowLeftRight, ArrowRight, Minus, Trash2, Check } from 'lucide-react'
import { LEARNING_CANVAS_EDGE_LABEL_MAX } from '../constants'
import type { LearningCanvasArrow } from '../types'

export interface LearningCanvasEdgeData {
  label?: string
  arrow?: LearningCanvasArrow
  readOnly?: boolean
  onUpdateEdge?: (id: string, updates: { label?: string; arrow?: LearningCanvasArrow }) => void
  onDeleteEdge?: (id: string) => void
}

export function LearningCanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  selected,
  data,
}: EdgeProps) {
  const edgeData = data as unknown as LearningCanvasEdgeData
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editLabel, setEditLabel] = useState(edgeData?.label ?? '')

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const arrow = edgeData?.arrow || 'to'

  const handleSaveLabel = useCallback(() => {
    setIsEditingLabel(false)
    const trimmed = editLabel.trim().slice(0, LEARNING_CANVAS_EDGE_LABEL_MAX)
    edgeData?.onUpdateEdge?.(id, { label: trimmed || undefined })
  }, [id, edgeData, editLabel])

  const handleCycleArrow = () => {
    const nextArrow: LearningCanvasArrow =
      arrow === 'none' ? 'to' : arrow === 'to' ? 'both' : 'none'
    edgeData?.onUpdateEdge?.(id, { arrow: nextArrow })
  }

  // Markers
  const markerEnd = arrow === 'to' || arrow === 'both' ? 'url(#learning-arrow-end)' : undefined
  const markerStart = arrow === 'both' ? 'url(#learning-arrow-start)' : undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        className={`learning-edge__path ${selected ? 'is-selected' : ''}`}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan z-30"
        >
          {isEditingLabel ? (
            <div className="flex items-center gap-1 p-1 bg-white border border-navy-900-20 rounded-lg shadow-md">
              <input
                type="text"
                value={editLabel}
                maxLength={LEARNING_CANVAS_EDGE_LABEL_MAX}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveLabel()
                  else if (e.key === 'Escape') setIsEditingLabel(false)
                }}
                autoFocus
                placeholder="Edge label"
                className="w-24 px-1.5 py-0.5 text-xs text-navy-900 border border-navy-900-20 rounded focus:outline-none focus:ring-1 focus:ring-navy-800"
              />
              <button
                type="button"
                onClick={handleSaveLabel}
                className="p-1 rounded bg-navy-900 text-white hover:bg-navy-800"
              >
                <Check size={12} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {/* Visible label or add label button */}
              {edgeData?.label ? (
                <button
                  type="button"
                  onDoubleClick={() => !edgeData.readOnly && setIsEditingLabel(true)}
                  className="learning-edge-badge"
                  title="Double-click to edit label"
                >
                  {edgeData.label}
                </button>
              ) : selected && !edgeData?.readOnly ? (
                <button
                  type="button"
                  onClick={() => setIsEditingLabel(true)}
                  className="px-2 py-0.5 text-[11px] font-semibold text-navy-800 bg-white border border-navy-900-20 rounded-full shadow-sm hover:bg-navy-900-5"
                >
                  + Label
                </button>
              ) : null}

              {/* Edge Controls when selected and not readOnly */}
              {selected && !edgeData?.readOnly && (
                <div className="flex items-center gap-0.5 bg-white border border-navy-900-12 rounded-lg shadow p-0.5">
                  <button
                    type="button"
                    onClick={handleCycleArrow}
                    aria-label={`Cycle arrow style (current: ${arrow})`}
                    className="p-1 rounded text-navy-900 hover:bg-navy-900-8"
                    title={`Arrow: ${arrow}`}
                  >
                    {arrow === 'none' && <Minus size={13} aria-hidden="true" />}
                    {arrow === 'to' && <ArrowRight size={13} aria-hidden="true" />}
                    {arrow === 'both' && <ArrowLeftRight size={13} aria-hidden="true" />}
                  </button>
                  {edgeData?.onDeleteEdge && (
                    <button
                      type="button"
                      onClick={() => edgeData.onDeleteEdge?.(id)}
                      aria-label="Delete edge"
                      className="p-1 rounded text-navy-900 hover:text-feedback-error hover:bg-feedback-error-bg"
                      title="Delete connection"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
