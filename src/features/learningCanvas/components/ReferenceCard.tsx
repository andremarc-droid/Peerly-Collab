import type { NodeProps } from '@xyflow/react'
import { BookOpen, HelpCircle, Network, Sparkles, ExternalLink, Trash2, Palette, AlertCircle } from 'lucide-react'
import { CardHandles } from '../../canvas/shared'
import { CardColorPicker } from './CardColorPicker'
import { useState } from 'react'
import type { LearningCanvasColor, LearningCanvasRefType, LearningCanvasNode } from '../types'

export interface ResolvedReferenceInfo {
  id: string
  title: string
  type: LearningCanvasRefType
  isCanvasActivity?: boolean
  available: boolean
}

export interface ReferenceCardData {
  reference?: {
    refType: LearningCanvasRefType
    refId: string
  }
  color: LearningCanvasColor
  readOnly?: boolean
  isHighlighted?: boolean
  resolvedInfo?: ResolvedReferenceInfo
  onOpenReference?: (refType: LearningCanvasRefType, refId: string) => void
  onPickReference?: (nodeId: string) => void
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
}

export function ReferenceCard({ id, data, selected }: NodeProps & { data: ReferenceCardData }) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const refType = data.reference?.refType
  const refId = data.reference?.refId
  const info = data.resolvedInfo

  const isAvailable = Boolean(info && info.available)
  const isPendingResolution = info === undefined && Boolean(refId)

  // Type-specific icon
  const renderIcon = () => {
    if (!isAvailable && !isPendingResolution) {
      return <AlertCircle size={16} aria-hidden="true" className="text-navy-800-72" />
    }
    if (refType === 'module') return <BookOpen size={16} aria-hidden="true" />
    if (refType === 'learning') return <Sparkles size={16} aria-hidden="true" />
    if (info?.isCanvasActivity) return <Network size={16} aria-hidden="true" />
    return <HelpCircle size={16} aria-hidden="true" />
  }

  const getTypeLabel = () => {
    if (refType === 'module') return 'Module'
    if (refType === 'learning') return 'Learning canvas'
    if (info?.isCanvasActivity) return 'Canvas activity'
    if (refType === 'quiz') return 'Quiz'
    return 'Reference'
  }

  const cardColorClass = `learning-card--${data.color || 'none'}`
  const highlightClass = data.isHighlighted ? 'ring-4 ring-amber-400' : ''

  return (
    <article
      tabIndex={0}
      aria-label={`Reference card: ${isAvailable ? info?.title : 'Not available'}`}
      className={`learning-card w-full h-full p-3.5 flex flex-col justify-between ${cardColorClass} ${highlightClass} ${
        selected ? 'is-selected' : ''
      }`}
      data-testid={`reference-card-${id}`}
    >
      <CardHandles isConnectable={!data.readOnly} />

      <div className="flex flex-col h-full justify-between gap-2 overflow-hidden">
        {/* Header / Type Badge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-navy-900-8 text-navy-900 text-xs font-semibold">
            {renderIcon()}
            <span>{getTypeLabel()}</span>
          </div>

          {!data.readOnly && data.onPickReference && (
            <button
              type="button"
              onClick={() => data.onPickReference?.(id)}
              className="text-xs text-navy-800 underline hover:text-navy-900"
            >
              Change
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          {isAvailable && info ? (
            <h4 className="text-sm font-semibold text-navy-900 line-clamp-2 m-0">
              {info.title}
            </h4>
          ) : isPendingResolution ? (
            <span className="text-xs text-navy-800-72 italic">Loading reference…</span>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-navy-800-72 font-medium">
              <span>Not available</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-navy-900-8 flex items-center justify-end shrink-0">
          {isAvailable && info && refType && refId ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                data.onOpenReference?.(refType, refId)
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-navy-900 bg-white border border-navy-900-20 rounded-lg shadow-sm hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
              aria-label={`Open ${info.title}`}
            >
              <span>Open</span>
              <ExternalLink size={12} aria-hidden="true" />
            </button>
          ) : (
            <span className="text-xs text-navy-800-72">Unavailable</span>
          )}
        </div>
      </div>

      {/* Floating Toolbar when selected and not readOnly */}
      {selected && !data.readOnly && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1 bg-white border border-navy-900-12 rounded-xl shadow-md p-1">
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            aria-label="Change card color"
            className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Change color"
          >
            <Palette size={14} aria-hidden="true" />
          </button>
          {data.onDelete && (
            <button
              type="button"
              onClick={() => data.onDelete?.(id)}
              aria-label="Delete card"
              className="p-1.5 rounded-lg text-navy-900 hover:bg-feedback-error-bg hover:text-feedback-error focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Delete card"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {showColorPicker && !data.readOnly && (
        <div className="absolute -top-20 right-0 z-40">
          <CardColorPicker
            value={data.color}
            onChange={(color) => {
              data.onUpdate?.(id, { color })
              setShowColorPicker(false)
            }}
          />
        </div>
      )}
    </article>
  )
}
