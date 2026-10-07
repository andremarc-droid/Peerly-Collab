import { useState, useRef, useEffect, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Edit2, Check, Trash2, Palette } from 'lucide-react'
import { CardHandles } from '../../canvas/shared'
import { SafeMarkdown } from './SafeMarkdown'
import { CardColorPicker } from './CardColorPicker'
import { LEARNING_CANVAS_TEXT_MAX } from '../constants'
import type { LearningCanvasNode, LearningCanvasColor } from '../types'

export interface TextCardData {
  text: string
  color: LearningCanvasColor
  readOnly?: boolean
  isHighlighted?: boolean
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
}

export function TextCard({ id, data, selected }: NodeProps & { data: TextCardData }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(data.text ?? '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isEditing) {
      setEditText(data.text ?? '')
    }
  }, [data.text, isEditing])

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const handleSave = useCallback(() => {
    setIsEditing(false)
    const trimmed = editText.trim().slice(0, LEARNING_CANVAS_TEXT_MAX)
    if (trimmed !== data.text) {
      data.onUpdate?.(id, { text: trimmed })
    }
  }, [id, data, editText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditText(data.text ?? '')
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!data.readOnly) {
      setIsEditing(true)
    }
  }

  const charCount = editText.length
  const isOverLimit = charCount > LEARNING_CANVAS_TEXT_MAX

  const cardColorClass = `learning-card--${data.color || 'none'}`
  const highlightClass = data.isHighlighted ? 'ring-4 ring-amber-400' : ''

  return (
    <article
      tabIndex={0}
      aria-label={`Text card: ${data.text ? data.text.slice(0, 60) : 'Empty text card'}`}
      onDoubleClick={handleDoubleClick}
      className={`learning-card w-full h-full p-3.5 flex flex-col justify-between ${cardColorClass} ${highlightClass} ${
        selected ? 'is-selected' : ''
      }`}
      data-testid={`text-card-${id}`}
    >
      <CardHandles isConnectable={!data.readOnly} />

      {/* Card Content or Inline Editor */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEditing ? (
          <div className="flex flex-col h-full gap-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Edit text content (Markdown supported)"
              maxLength={LEARNING_CANVAS_TEXT_MAX}
              className="w-full flex-1 p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
              placeholder="Type markdown text here…"
            />
            <div className="flex items-center justify-between text-xs text-navy-800-72 shrink-0">
              <span className={isOverLimit ? 'text-feedback-error font-bold' : ''}>
                {charCount} / {LEARNING_CANVAS_TEXT_MAX}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setEditText(data.text ?? '')
                  }}
                  className="px-2 py-1 rounded text-navy-800 hover:bg-navy-900-8"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-navy-900 text-white rounded font-medium hover:bg-navy-800"
                >
                  <Check size={12} aria-hidden="true" />
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-navy-900 break-words leading-relaxed">
            {data.text ? (
              <SafeMarkdown content={data.text} />
            ) : (
              <span className="text-navy-800-72 italic">Double-click to type text…</span>
            )}
          </div>
        )}
      </div>

      {/* Floating Toolbar when selected and not readOnly */}
      {selected && !data.readOnly && !isEditing && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1 bg-white border border-navy-900-12 rounded-xl shadow-md p-1">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            aria-label="Edit text"
            className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Edit text"
          >
            <Edit2 size={14} aria-hidden="true" />
          </button>
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
