import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { AlertCircle, ImageOff } from 'lucide-react'
import { Skeleton } from '../../../../shared/ui/Skeleton'
import type { CanvasNodeData } from '../../mapping'
import { useCanvasImages } from '../CanvasImagesContext'
import { isLegacyImageCard } from '../../schemas'
import { CardHandles } from './CardHandles'

export function ImageCard({ data, selected, isConnectable }: NodeProps) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const nodeData = data as unknown as CanvasNodeData
  const card = nodeData?.card
  const images = useCanvasImages()

  if (!card) return null

  const isLegacy = isLegacyImageCard(card)
  const imageEntry = card.imageId ? images[card.imageId] : undefined
  const dataUrl = imageEntry?.dataUrl
  const altText = card.alt || imageEntry?.alt || card.title || 'Canvas image'

  return (
    <div
      className={`canvas-node canvas-node--image group ${selected ? 'is-selected' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={`Image card: ${altText}`}
      data-testid={`card-${card.id}`}
    >
      <CardHandles isConnectable={isConnectable} />
      <div className="canvas-node__body">
        <div className="canvas-node__image-container relative flex items-center justify-center overflow-hidden bg-navy-50">
          {isLegacy ? (
            <div
              className="flex flex-col items-center justify-center p-2 text-center text-xs font-medium text-feedback-warning"
              role="alert"
            >
              <AlertCircle size={18} className="mb-1 text-feedback-warning" aria-hidden="true" />
              <span>Re-upload required</span>
            </div>
          ) : dataUrl && !errored ? (
            <>
              {!loaded && (
                <Skeleton
                  className="absolute inset-0 h-full w-full"
                  label={`Loading image: ${altText}`}
                />
              )}
              <img
                src={dataUrl}
                alt={altText}
                className={`h-full w-full object-contain transition-opacity duration-200 ${
                  loaded ? 'opacity-100' : 'opacity-0'
                }`}
                loading="lazy"
                onLoad={() => setLoaded(true)}
                onError={() => setErrored(true)}
              />
            </>
          ) : (
            <div
              className="flex flex-col items-center justify-center p-2 text-center text-xs text-navy-800-72"
              role="status"
            >
              <ImageOff size={18} className="mb-1 text-navy-700" aria-hidden="true" />
              <span className="font-medium">Image unavailable</span>
              {card.alt && (
                <span className="mt-0.5 max-w-full truncate text-[11px] text-navy-800-48">
                  {card.alt}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
