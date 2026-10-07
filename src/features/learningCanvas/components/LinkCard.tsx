import { useState, useCallback } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ExternalLink, Edit2, Trash2, Palette, Check, Globe } from 'lucide-react'
import { CardHandles } from '../../canvas/shared'
import { CardColorPicker } from './CardColorPicker'
import { LEARNING_CANVAS_TITLE_MAX, LEARNING_CANVAS_DESCRIPTION_MAX } from '../constants'
import type { LearningCanvasNode, LearningCanvasColor } from '../types'

export interface LinkCardData {
  link?: {
    url: string
    title?: string
    note?: string
  }
  color: LearningCanvasColor
  readOnly?: boolean
  isHighlighted?: boolean
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
}

export function LinkCard({ id, data, selected }: NodeProps & { data: LinkCardData }) {
  const [isEditing, setIsEditing] = useState(false)
  const [url, setUrl] = useState(data.link?.url ?? '')
  const [title, setTitle] = useState(data.link?.title ?? '')
  const [note, setNote] = useState(data.link?.note ?? '')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!data.readOnly) {
      setUrl(data.link?.url ?? '')
      setTitle(data.link?.title ?? '')
      setNote(data.link?.note ?? '')
      setUrlError(null)
      setIsEditing(true)
    }
  }

  const handleSave = useCallback(() => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl.startsWith('https://')) {
      setUrlError('URL must begin with https://')
      return
    }
    setUrlError(null)
    setIsEditing(false)
    data.onUpdate?.(id, {
      link: {
        url: trimmedUrl,
        title: title.trim().slice(0, LEARNING_CANVAS_TITLE_MAX) || trimmedUrl,
        note: note.trim().slice(0, LEARNING_CANVAS_DESCRIPTION_MAX) || undefined,
      },
    })
  }, [id, data, url, title, note])

  const cardColorClass = `learning-card--${data.color || 'none'}`
  const highlightClass = data.isHighlighted ? 'ring-4 ring-amber-400' : ''
  const displayTitle = data.link?.title || (data.link?.url ? new URL(data.link.url).hostname : 'Web Link')

  return (
    <article
      tabIndex={0}
      aria-label={`Link card: ${displayTitle}`}
      onDoubleClick={handleStartEdit}
      className={`learning-card w-full h-full p-3.5 flex flex-col justify-between ${cardColorClass} ${highlightClass} ${
        selected ? 'is-selected' : ''
      }`}
      data-testid={`link-card-${id}`}
    >
      <CardHandles isConnectable={!data.readOnly} />

      {isEditing ? (
        <div className="flex flex-col h-full gap-2 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-0.5">HTTPS URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setUrlError(null)
              }}
              placeholder="https://example.com"
              className="w-full px-2 py-1 text-xs border border-navy-900-20 rounded bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-800"
            />
            {urlError && <span className="text-[11px] text-feedback-error font-medium">{urlError}</span>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-0.5">Title (optional)</label>
            <input
              type="text"
              value={title}
              maxLength={LEARNING_CANVAS_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource name"
              className="w-full px-2 py-1 text-xs border border-navy-900-20 rounded bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-0.5">Note (optional)</label>
            <textarea
              value={note}
              maxLength={LEARNING_CANVAS_DESCRIPTION_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief note or summary"
              rows={2}
              className="w-full px-2 py-1 text-xs border border-navy-900-20 rounded bg-white text-navy-900 resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
            />
          </div>

          <div className="flex items-center justify-end gap-1.5 mt-auto pt-1">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 text-xs rounded text-navy-800 hover:bg-navy-900-8"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-navy-900 text-white rounded font-medium hover:bg-navy-800"
            >
              <Check size={12} aria-hidden="true" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full justify-between gap-2 overflow-hidden">
          <div className="flex items-start gap-2 min-h-0">
            <span className="p-1.5 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
              <Globe size={16} aria-hidden="true" />
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-navy-900 truncate m-0">
                {displayTitle}
              </h4>
              {data.link?.note && (
                <p className="text-xs text-navy-800-72 line-clamp-2 mt-1 m-0">
                  {data.link.note}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-navy-900-8 shrink-0">
            <span className="text-[11px] text-navy-800-72 truncate max-w-[140px]">
              {data.link?.url}
            </span>
            {data.link?.url && (
              <a
                href={data.link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open link ${displayTitle} in new tab`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-navy-900 bg-white border border-navy-900-20 rounded-lg shadow-sm hover:bg-navy-900-5 focus:outline-none focus:ring-2 focus:ring-navy-800"
                onClick={(e) => e.stopPropagation()}
              >
                <span>Open</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Floating Toolbar when selected and not readOnly */}
      {selected && !data.readOnly && !isEditing && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1 bg-white border border-navy-900-12 rounded-xl shadow-md p-1">
          <button
            type="button"
            onClick={handleStartEdit}
            aria-label="Edit link"
            className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-8 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Edit link"
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
