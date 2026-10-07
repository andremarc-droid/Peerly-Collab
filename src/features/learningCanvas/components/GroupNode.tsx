import { useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { Edit2, Check, Trash2, Palette, Layers } from 'lucide-react'
import { CardColorPicker } from './CardColorPicker'
import { LEARNING_CANVAS_GROUP_LABEL_MAX } from '../constants'
import type { LearningCanvasNode, LearningCanvasColor } from '../types'

export interface GroupNodeData {
  group?: {
    label?: string
  }
  color: LearningCanvasColor
  readOnly?: boolean
  isHighlighted?: boolean
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
}

export function GroupNode({ id, data, selected }: NodeProps & { data: GroupNodeData }) {
  const [isEditing, setIsEditing] = useState(false)
  const [label, setLabel] = useState(data.group?.label ?? '')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleSave = () => {
    setIsEditing(false)
    const trimmed = label.trim().slice(0, LEARNING_CANVAS_GROUP_LABEL_MAX)
    if (trimmed !== data.group?.label) {
      data.onUpdate?.(id, { group: { label: trimmed } })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setLabel(data.group?.label ?? '')
    }
  }

  const cardColorClass = `learning-card--${data.color || 'tint'}`
  const highlightClass = data.isHighlighted ? 'ring-4 ring-amber-400' : ''
  const displayLabel = data.group?.label || 'Group'

  return (
    <div
      tabIndex={0}
      aria-label={`Group container: ${displayLabel}`}
      className={`learning-group-node w-full h-full p-3 flex flex-col justify-between ${cardColorClass} ${highlightClass} ${
        selected ? 'is-selected' : ''
      }`}
      data-testid={`group-node-${id}`}
    >
      {/* NodeResizer for free resizing */}
      <NodeResizer
        minWidth={120}
        minHeight={120}
        isVisible={selected && !data.readOnly}
        lineClassName="border-navy-800"
        handleClassName="w-3 h-3 bg-white border-2 border-navy-800 rounded-sm"
      />

      {/* Header bar with label */}
      <div className="flex items-center justify-between gap-2 border-b border-navy-900-12 pb-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Layers size={16} className="text-navy-900 shrink-0" aria-hidden="true" />
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={label}
                maxLength={LEARNING_CANVAS_GROUP_LABEL_MAX}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Group label"
                autoFocus
                className="w-full px-2 py-0.5 text-xs font-semibold text-navy-900 bg-white border border-navy-900-20 rounded focus:outline-none focus:ring-2 focus:ring-navy-800"
              />
              <button
                type="button"
                onClick={handleSave}
                className="p-1 rounded bg-navy-900 text-white hover:bg-navy-800"
              >
                <Check size={12} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span
              onDoubleClick={() => !data.readOnly && setIsEditing(true)}
              className="text-sm font-bold text-navy-900 truncate cursor-text"
              title="Double-click to edit group label"
            >
              {displayLabel}
            </span>
          )}
        </div>

        {/* Action icons when selected */}
        {selected && !data.readOnly && !isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              aria-label="Edit group label"
              className="p-1 rounded text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
            >
              <Edit2 size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowColorPicker(!showColorPicker)}
              aria-label="Change group color"
              className="p-1 rounded text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
            >
              <Palette size={13} aria-hidden="true" />
            </button>
            {data.onDelete && (
              <button
                type="button"
                onClick={() => data.onDelete?.(id)}
                aria-label="Delete group"
                className="p-1 rounded text-navy-900 hover:text-feedback-error hover:bg-feedback-error-bg focus:outline-none focus:ring-2 focus:ring-navy-800"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {showColorPicker && !data.readOnly && (
        <div className="absolute top-12 left-3 z-40">
          <CardColorPicker
            value={data.color}
            onChange={(color) => {
              data.onUpdate?.(id, { color })
              setShowColorPicker(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
