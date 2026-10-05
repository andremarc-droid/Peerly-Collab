import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { Check, HelpCircle, X } from 'lucide-react'
import type { CanvasEdgeData } from '../../mapping'

/**
 * Custom edge with bezier curve, optional directed arrow marker,
 * clear selected state, and accessible review status badges (color + icon + text label).
 */
export function CanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const edgeData = data as unknown as CanvasEdgeData
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const status = edgeData?.status
  let statusClass = ''
  if (status === 'correct') statusClass = 'canvas-edge__path--correct'
  else if (status === 'missed') statusClass = 'canvas-edge__path--missed'
  else if (status === 'wrong') statusClass = 'canvas-edge__path--wrong'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        className={`canvas-edge__path ${statusClass} ${selected ? 'is-selected' : ''}`}
      />
      {(status || edgeData?.label) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {status === 'correct' && (
              <span className="canvas-edge-badge canvas-edge-badge--correct" role="status">
                <Check size={11} aria-hidden="true" />
                <span>Correct</span>
              </span>
            )}
            {status === 'missed' && (
              <span className="canvas-edge-badge canvas-edge-badge--missed" role="status">
                <HelpCircle size={11} aria-hidden="true" />
                <span>Missed</span>
              </span>
            )}
            {status === 'wrong' && (
              <span className="canvas-edge-badge canvas-edge-badge--wrong" role="status">
                <X size={11} aria-hidden="true" />
                <span>Incorrect</span>
              </span>
            )}
            {!status && edgeData?.label && (
              <span className="canvas-edge-badge">{edgeData.label}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
