import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { ExternalLink } from 'lucide-react'
import { buildDriveEmbedUrl, buildDriveOpenUrl } from '../../../modules/links'
import { Skeleton } from '../../../../shared/ui/Skeleton'
import type { CanvasNodeData } from '../../mapping'
import { CardHandles } from './CardHandles'

export function ImageCard({ data, selected, isConnectable }: NodeProps) {
  const [loaded, setLoaded] = useState(false)
  const nodeData = data as unknown as CanvasNodeData
  const card = nodeData?.card
  if (!card) return null

  let embedUrl = ''
  let openUrl = ''
  try {
    if (card.driveFileId) {
      embedUrl = buildDriveEmbedUrl(card.driveKind ?? 'file', card.driveFileId)
      openUrl = buildDriveOpenUrl(card.driveKind ?? 'file', card.driveFileId)
    } else if (card.url) {
      embedUrl = card.url
      openUrl = card.url
    }
  } catch {
    openUrl = card.url ?? ''
  }

  const label = card.title || card.content || 'Image preview'

  return (
    <div
      className={`canvas-node canvas-node--image group ${selected ? 'is-selected' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={`Image: ${label}`}
      data-testid={`card-${card.id}`}
    >
      <CardHandles isConnectable={isConnectable} />
      <div className="canvas-node__body">
        <div className="canvas-node__image-container">
          {!loaded && embedUrl && (
            <Skeleton
              className="absolute inset-0 w-full h-full"
              label={`Loading image preview: ${label}`}
            />
          )}
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={label}
              className="canvas-node__iframe"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setLoaded(true)}
            />
          ) : (
            <div className="p-2 text-sm text-navy-900-72">Preview not available</div>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="canvas-node__image-fallback"
              aria-label={`Open ${label} in Google Drive`}
              title="Open in Drive"
            >
              <ExternalLink size={11} aria-hidden="true" />
              <span>Open in Drive</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
