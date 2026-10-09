import { sameBoard } from './collab/mergeContent'
import { validateLearningCanvasNode } from './schemas'
import type { LearningCanvasContent, LearningCanvasEdge, LearningCanvasNode } from './types'

/**
 * Returns the part of the editor content that passes the persistence rules.
 *
 * Freshly added cards are valid only once the user fills them in (a link card
 * needs an https URL and a title, a reference card needs a target). Without
 * this filter a single half-finished card makes every autosave fail
 * validation, so nothing else on the board would be saved either.
 *
 * Incomplete cards stay on the board; they are simply not persisted until valid.
 */
export function toSavableContent(content: LearningCanvasContent): LearningCanvasContent {
  const nodes: LearningCanvasNode[] = []
  for (const node of content.nodes) {
    try {
      nodes.push(validateLearningCanvasNode(node))
    } catch {
      // incomplete placeholder card: skip until the user finishes it
    }
  }

  const ids = new Set(nodes.map((n) => n.id))
  const seenIds = new Set<string>()
  const seenConnections = new Set<string>()
  const edges: LearningCanvasEdge[] = []
  for (const edge of content.edges) {
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to)) continue
    if (seenIds.has(edge.id)) continue
    const key = `${edge.from}->${edge.to}:${edge.fromSide ?? ''}:${edge.toSide ?? ''}`
    if (seenConnections.has(key)) continue
    seenIds.add(edge.id)
    seenConnections.add(key)
    edges.push(edge)
  }

  return { ...content, nodes, edges }
}

/**
 * True when another save is needed. Half-finished cards stay on the board but are not written,
 * so they must not keep the canvas marked dirty after a successful save.
 */
export function persistableBoardDiffers(local: LearningCanvasContent, remote: LearningCanvasContent): boolean {
  return !sameBoard(toSavableContent(local), toSavableContent(remote))
}
