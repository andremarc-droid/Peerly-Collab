import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { useStore, type NodeProps } from '@xyflow/react'
import { Edit2, Check, Trash2, Palette } from 'lucide-react'
import { CardHandles } from '../../canvas/components/CardHandles'
import { SafeMarkdown } from './SafeMarkdown'
import { CardColorPicker } from './CardColorPicker'
import { LEARNING_CANVAS_TEXT_MAX } from '../constants'
import type { LearningCanvasNode, LearningCanvasColor } from '../types'

export interface TextCardData {
  text: string
  color: LearningCanvasColor
  canvasId?: string
  readOnly?: boolean
  isHighlighted?: boolean
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
  onEditingChange?: (id: string, isEditing: boolean) => void
}

/**
 * Preserves in-progress inline edit drafts across unmount/remount cycles
 * (for example if React Flow's viewport culling unmounts an off-screen card),
 * keyed by `${canvasId}:${nodeId}` so drafts never leak across canvases.
 */
const unsavedTextDrafts = new Map<string, string>()

function getDraftKey(nodeId: string, canvasId?: string): string {
  return `${canvasId ?? 'default'}:${nodeId}`
}

export function getUnsavedTextDraft(nodeId: string, canvasId?: string): string | undefined {
  return unsavedTextDrafts.get(getDraftKey(nodeId, canvasId))
}

export function deleteUnsavedTextDraft(nodeId: string, canvasId?: string): void {
  unsavedTextDrafts.delete(getDraftKey(nodeId, canvasId))
}

export function clearUnsavedTextDrafts(canvasId?: string): void {
  if (!canvasId) {
    unsavedTextDrafts.clear()
    return
  }
  const prefix = `${canvasId}:`
  for (const key of Array.from(unsavedTextDrafts.keys())) {
    if (key.startsWith(prefix)) {
      unsavedTextDrafts.delete(key)
    }
  }
}

function TextCardInternal({ id, data, selected }: NodeProps & { data: TextCardData }) {
  const draftKey = getDraftKey(id, data.canvasId)
  const [isEditing, setIsEditing] = useState(() => unsavedTextDrafts.has(draftKey))
  const [editText, setEditText] = useState(() => unsavedTextDrafts.get(draftKey) ?? (data.text ?? ''))
  const [showColorPicker, setShowColorPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const startEditing = useCallback(() => {
    const initialDraft = unsavedTextDrafts.get(draftKey) ?? (data.text ?? '')
    unsavedTextDrafts.set(draftKey, initialDraft)
    setEditText(initialDraft)
    setIsEditing(true)
    data.onEditingChange?.(id, true)
  }, [id, draftKey, data])

  const stopEditing = useCallback(() => {
    unsavedTextDrafts.delete(draftKey)
    setIsEditing(false)
    data.onEditingChange?.(id, false)
  }, [id, draftKey, data])

  // Level of detail: below 0.5 zoom and unselected, render simplified plain text without handles.
  // Selector returns boolean so useStore triggers re-render ONLY when crossing the 0.5 threshold.
  const isLowDetail = useStore((s) => s.transform[2] < 0.5)

  useEffect(() => {
    if (!isEditing) {
      setEditText(data.text ?? '')
    }
  }, [data.text, isEditing])

  useEffect(() => {
    if (isEditing) {
      data.onEditingChange?.(id, true)
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.select()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  const handleSave = useCallback(() => {
    stopEditing()
    const trimmed = editText.trim().slice(0, LEARNING_CANVAS_TEXT_MAX)
    if (trimmed !== data.text) {
      data.onUpdate?.(id, { text: trimmed })
    }
  }, [id, data, editText, stopEditing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      stopEditing()
      setEditText(data.text ?? '')
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!data.readOnly) {
      startEditing()
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
      } ${isLowDetail && !selected && !isEditing ? 'learning-card--lod' : ''}`}
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
              onChange={(e) => {
                const next = e.target.value
                unsavedTextDrafts.set(draftKey, next)
                setEditText(next)
              }}
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
                    stopEditing()
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
        ) : isLowDetail && !selected ? (
          <div className="text-sm text-navy-900 break-words whitespace-pre-wrap leading-relaxed line-clamp-6">
            {data.text || <span className="text-navy-800-72 italic">Double-click to type text…</span>}
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
            onClick={startEditing}
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

export const TextCard = memo(TextCardInternal)
