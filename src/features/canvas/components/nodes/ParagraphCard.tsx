import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '../../mapping'
import { CardHandles } from './CardHandles'

export function ParagraphCard({ data, selected, isConnectable }: NodeProps) {
  const nodeData = data as unknown as CanvasNodeData
  const card = nodeData?.card
  if (!card) return null

  return (
    <div
      className={`canvas-node canvas-node--paragraph group ${selected ? 'is-selected' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={card.title ? `Paragraph: ${card.title}` : `Paragraph: ${card.content.slice(0, 30)}`}
      data-testid={`card-${card.id}`}
    >
      <CardHandles isConnectable={isConnectable} />
      <div className="canvas-node__body">
        {card.title && <div className="canvas-node__title">{card.title}</div>}
        <div className="canvas-node__text">{card.content}</div>
      </div>
    </div>
  )
}
