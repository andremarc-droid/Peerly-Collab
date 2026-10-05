import type { NodeProps } from '@xyflow/react'
import { ExternalLink } from 'lucide-react'
import type { CanvasNodeData } from '../../mapping'
import { CardHandles } from './CardHandles'

export function LinkCard({ data, selected, isConnectable }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const card = nodeData?.card
  if (!card) return null

  let host = ''
  if (card.url) {
    try {
      host = new URL(card.url).hostname.replace(/^www\./, '')
    } catch {
      host = card.url
    }
  }

  const label = card.title || host || 'Link'

  return (
    <div
      className={`canvas-node canvas-node--link group ${selected ? 'is-selected' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={`Link: ${label}`}
      data-testid={`card-${card.id}`}
    >
      <CardHandles isConnectable={isConnectable} />
      <div className="canvas-node__body">
        {card.title && <div className="canvas-node__title">{card.title}</div>}
        {card.content && <div className="canvas-node__text mb-1">{card.content}</div>}
        {card.url && (
          <a
            href={card.url}
            target="_blank"
            rel="noopener noreferrer"
            className="canvas-node__host"
            aria-label={`Visit ${label} (${host})`}
            title={`Open ${card.url} in new tab`}
          >
            <ExternalLink size={11} aria-hidden="true" />
            <span className="truncate">{host || 'External link'}</span>
          </a>
        )}
      </div>
    </div>
  )
}
