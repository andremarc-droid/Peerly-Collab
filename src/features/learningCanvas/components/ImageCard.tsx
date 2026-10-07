import { useState, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import { Edit2, Check, Trash2, Palette, Image as ImageIcon, ImageOff, Upload } from 'lucide-react'
import { CardHandles } from '../../canvas/shared'
import { processImageFile } from '../../canvas/imageProcessing'
import { CardColorPicker } from './CardColorPicker'
import type { LearningCanvasNode, LearningCanvasColor } from '../types'

export interface ImageCardData {
  image: {
    dataUrl: string
    alt?: string
    caption?: string
  }
  color: LearningCanvasColor
  readOnly?: boolean
  isHighlighted?: boolean
  onUpdate?: (id: string, updates: Partial<LearningCanvasNode>) => void
  onDelete?: (id: string) => void
}

export function ImageCard({ id, data, selected }: NodeProps & { data: ImageCardData }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editAlt, setEditAlt] = useState(data.image?.alt ?? '')
  const [editCaption, setEditCaption] = useState(data.image?.caption ?? '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [imageError, setImageError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const processed = await processImageFile(file)
      const dataUrl = `data:${processed.mimeType};base64,${processed.data}`
      data.onUpdate?.(id, {
        image: {
          ...data.image,
          dataUrl,
          alt: data.image?.alt || file.name.replace(/\.[^/.]+$/, '').slice(0, 120),
        },
      })
      setImageError(false)
    } catch {
      setImageError(true)
    } finally {
      e.target.value = ''
    }
  }

  const handleSave = () => {
    setIsEditing(false)
    data.onUpdate?.(id, {
      image: {
        ...data.image,
        alt: editAlt.trim().slice(0, 120),
        caption: editCaption.trim().slice(0, 300),
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false)
      setEditAlt(data.image?.alt ?? '')
      setEditCaption(data.image?.caption ?? '')
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave()
    }
  }

  const cardColorClass = `learning-card--${data.color || 'none'}`
  const highlightClass = data.isHighlighted ? 'ring-4 ring-amber-400' : ''
  const altText = data.image?.alt || data.image?.caption || 'Canvas image'

  return (
    <article
      tabIndex={0}
      aria-label={`Image card: ${altText}`}
      className={`learning-card w-full h-full p-3 flex flex-col justify-between ${cardColorClass} ${highlightClass} ${
        selected ? 'is-selected' : ''
      }`}
      data-testid={`image-card-${id}`}
    >
      <CardHandles isConnectable={!data.readOnly} />

      {/* Hidden file input for uploading / replacing image */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload or replace image"
      />

      {/* Image container */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="relative flex-1 min-h-[100px] w-full flex items-center justify-center bg-navy-900-05 rounded-xl overflow-hidden border border-navy-900-08">
          {imageError || !data.image?.dataUrl ? (
            <div className="flex flex-col items-center justify-center p-3 text-center text-xs text-navy-800-72">
              <ImageOff size={24} className="mb-1 text-navy-700" aria-hidden="true" />
              <span className="font-medium mb-1.5">{imageError ? 'Image unavailable' : 'No image loaded'}</span>
              {!data.readOnly && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition-colors shadow-xs"
                >
                  <Upload size={12} aria-hidden="true" />
                  <span>Upload image</span>
                </button>
              )}
            </div>
          ) : (
            <img
              src={data.image.dataUrl}
              alt={altText}
              onError={() => setImageError(true)}
              className="w-full h-full object-contain select-none pointer-events-none"
              loading="lazy"
            />
          )}
        </div>

        {/* Caption/Alt text display or editor */}
        {isEditing ? (
          <div className="mt-2 grid gap-1.5 shrink-0" onKeyDown={handleKeyDown}>
            <input
              type="text"
              value={editAlt}
              onChange={(e) => setEditAlt(e.target.value)}
              placeholder="Alt description (e.g. Mitochondria structure)"
              maxLength={120}
              className="w-full p-1.5 text-xs text-navy-900 bg-white border border-navy-900-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-800"
              aria-label="Image alt text"
            />
            <input
              type="text"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder="Caption note (e.g. Fig 1.2 from textbook)"
              maxLength={300}
              className="w-full p-1.5 text-xs text-navy-900 bg-white border border-navy-900-20 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-800"
              aria-label="Image caption"
            />
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-2 py-0.5 text-xs rounded text-navy-800 hover:bg-navy-900-08"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-navy-900 text-white rounded text-xs font-medium hover:bg-navy-800"
              >
                <Check size={12} aria-hidden="true" />
                Save
              </button>
            </div>
          </div>
        ) : (
          (data.image?.caption || data.image?.alt) && (
            <div className="mt-1.5 px-1 shrink-0">
              {data.image.caption && (
                <p className="text-xs font-semibold text-navy-900 truncate m-0">
                  {data.image.caption}
                </p>
              )}
              {data.image.alt && (
                <p className="text-[11px] text-navy-800-72 truncate m-0">
                  {data.image.alt}
                </p>
              )}
            </div>
          )
        )}
      </div>

      {/* Floating Toolbar when selected and not readOnly */}
      {selected && !data.readOnly && !isEditing && (
        <div className="absolute -top-10 right-0 z-30 flex items-center gap-1 bg-white border border-navy-900-12 rounded-xl shadow-md p-1">
          <button
            type="button"
            onClick={() => {
              setEditAlt(data.image?.alt ?? '')
              setEditCaption(data.image?.caption ?? '')
              setIsEditing(true)
            }}
            aria-label="Edit caption or alt text"
            className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-08 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Edit caption / alt text"
          >
            <Edit2 size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Replace image file"
            className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-08 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Replace image"
          >
            <ImageIcon size={14} aria-hidden="true" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              aria-label="Change card color"
              className="p-1.5 rounded-lg text-navy-900 hover:bg-navy-900-08 focus:outline-none focus:ring-2 focus:ring-navy-800"
              title="Change color"
            >
              <Palette size={14} aria-hidden="true" />
            </button>
            {showColorPicker && (
              <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-navy-900-12 rounded-xl shadow-lg p-2">
                <CardColorPicker
                  selectedColor={data.color}
                  onSelectColor={(c) => {
                    data.onUpdate?.(id, { color: c })
                    setShowColorPicker(false)
                  }}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => data.onDelete?.(id)}
            aria-label="Delete image card"
            className="p-1.5 rounded-lg text-feedback-error hover:bg-navy-900-08 focus:outline-none focus:ring-2 focus:ring-navy-800"
            title="Delete card"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  )
}
