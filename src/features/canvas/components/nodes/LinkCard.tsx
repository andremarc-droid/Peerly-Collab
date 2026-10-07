import type { NodeProps } from '@xyflow/react'
import { ExternalLink } from 'lucide-react'
import type { CanvasNodeData } from '../../mapping'
import { safeHttpsUrl } from '../../safeUrl'
import { CardHandles } from './CardHandles'

export function LinkCard({ data, selected, isConnectable }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const card = nodeData?.card
  if (!card) return null

  // Card links can come from students, so only well-formed https URLs become clickable.
  const safeUrl = safeHttpsUrl(card.url)
  const hasBlockedUrl = Boolean(card.url) && !safeUrl

  let host = ''
  if (safeUrl) {
    try {
      host = new URL(safeUrl).hostname.replace(/^www\./, '')
    } catch {
      host = ''
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
        {safeUrl && (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="canvas-node__host"
            aria-label={`Visit ${label} (${host})`}
            title={`Open ${safeUrl} in new tab`}
          >
            <ExternalLink size={11} aria-hidden="true" />
            <span className="truncate">{host || 'External link'}</span>
          </a>
        )}
        {hasBlockedUrl && (
          <span
            className="canvas-node__host"
            title="This link was blocked because it is not a valid https:// address."
          >
            <span className="truncate">Link blocked</span>
          </span>
        )}
      </div>
    </div>
  )
}
