import {
  MAX_CANVAS_DESCRIPTION_LENGTH,
  MAX_CANVAS_TITLE_LENGTH,
  MAX_TEXT_NODE_LENGTH,
} from './constants'
import type { LearningCanvasContent, LearningCanvasNode, LearningCanvasTextNode } from './types'

/**
 * A "note" is a learning-canvas document flagged with this `sourceCanvasId`.
 * Its title lives on the canvas document, and its full text lives in one text card on the board.
 * The canvas `description` is only a short preview of that text (first 300 characters).
 */
export const NOTE_SOURCE_ID = 'note'
export const NOTE_NODE_ID = 'main-note'
export const NOTE_TITLE_MAX = MAX_CANVAS_TITLE_LENGTH
export const NOTE_CONTENT_MAX = MAX_TEXT_NODE_LENGTH

function isTextNode(node: LearningCanvasNode): node is LearningCanvasTextNode {
  return node.type === 'text'
}

function findNoteNode(nodes: LearningCanvasNode[]): LearningCanvasTextNode | undefined {
  return nodes.find((node) => isTextNode(node) && node.id === NOTE_NODE_ID) as LearningCanvasTextNode | undefined
    ?? nodes.find(isTextNode)
}

/** The full text of a note, read from its board (never from the truncated description). */
export function getNoteText(content: Pick<LearningCanvasContent, 'nodes'> | null | undefined): string {
  if (!content) return ''
  return findNoteNode(content.nodes)?.text ?? ''
}

/** The short preview stored on the canvas document and shown in lists and graph nodes. */
export function noteDescription(text: string): string {
  return text.slice(0, MAX_CANVAS_DESCRIPTION_LENGTH)
}

/** Returns a copy of the board whose note card holds `text`, adding the card when there is none. */
export function withNoteText(content: LearningCanvasContent, text: string): LearningCanvasContent {
  const clipped = text.slice(0, NOTE_CONTENT_MAX)
  const target = findNoteNode(content.nodes)
  if (!target) {
    const created: LearningCanvasTextNode = {
      id: NOTE_NODE_ID,
      type: 'text',
      x: 0,
      y: 0,
      width: 380,
      height: 240,
      color: 'none',
      text: clipped,
    }
    return { ...content, nodes: [...content.nodes, created] }
  }
  return {
    ...content,
    nodes: content.nodes.map((node) => (node.id === target.id ? { ...target, text: clipped } : node)),
  }
}
