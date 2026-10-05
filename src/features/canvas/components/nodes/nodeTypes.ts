import type { NodeTypes } from '@xyflow/react'
import { NoteCard } from './NoteCard'
import { ParagraphCard } from './ParagraphCard'
import { ImageCard } from './ImageCard'
import { LinkCard } from './LinkCard'

/**
 * Standard nodeTypes mapping defined statically outside React components
 * to avoid unnecessary re-renders in React Flow.
 */
export const canvasNodeTypes: NodeTypes = {
  note: NoteCard,
  paragraph: ParagraphCard,
  image: ImageCard,
  link: LinkCard,
}
