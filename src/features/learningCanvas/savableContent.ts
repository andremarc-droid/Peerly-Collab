import { sameBoard } from './collab/mergeContent'
import { validateLearningCanvasNode } from './schemas'
import type { LearningCanvasContent, LearningCanvasEdge, LearningCanvasNode } from './types'

export interface SavableContentReport {
  content: LearningCanvasContent
  droppedNodes: number
  droppedEdges: number
}

/**
 * Returns the part of the editor content that passes the persistence rules,
 * along with counts of any incomplete/invalid nodes and edges that were skipped.
 */
export function toSavableContentWithReport(content: LearningCanvasContent): SavableContentReport {
  const nodes: LearningCanvasNode[] = []
  let droppedNodes = 0
  for (const node of content.nodes) {
    try {
      nodes.push(validateLearningCanvasNode(node))
    } catch {
      // incomplete placeholder card: skip until the user finishes it
      droppedNodes += 1
    }
  }

  const ids = new Set(nodes.map((n) => n.id))
  const seenIds = new Set<string>()
  const seenConnections = new Set<string>()
  const edges: LearningCanvasEdge[] = []
  let droppedEdges = 0
  for (const edge of content.edges) {
    if (edge.from === edge.to || !ids.has(edge.from) || !ids.has(edge.to)) {
      droppedEdges += 1
      continue
    }
    if (seenIds.has(edge.id)) {
      droppedEdges += 1
      continue
    }
    const key = `${edge.from}->${edge.to}:${edge.fromSide ?? ''}:${edge.toSide ?? ''}`
    if (seenConnections.has(key)) {
      droppedEdges += 1
      continue
    }
    seenIds.add(edge.id)
    seenConnections.add(key)
    edges.push(edge)
  }

  return {
    content: { ...content, nodes, edges },
    droppedNodes,
    droppedEdges,
  }
}

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
  return toSavableContentWithReport(content).content
}

/**
 * True when another save is needed. Half-finished cards stay on the board but are not written,
 * so they must not keep the canvas marked dirty after a successful save.
 */
export function persistableBoardDiffers(local: LearningCanvasContent, remote: LearningCanvasContent): boolean {
  return !sameBoard(toSavableContent(local), toSavableContent(remote))
}