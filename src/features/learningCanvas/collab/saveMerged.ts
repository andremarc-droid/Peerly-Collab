import { runTransaction, Timestamp, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { learningCanvasContentRef, learningCanvasRef } from '../paths'
import {
  computeRefs,
  countStats,
  parseLearningCanvasContent,
  parseLearningCanvasMetadata,
} from '../schemas'
import type { LearningCanvasContent } from '../types'
import { getNoteText, noteDescription } from '../noteContent'
import { mergeContent, sameBoard } from './mergeContent'

export interface SaveMergedResult {
  /** The board as it is on the server after this save: my changes plus everyone else's. */
  content: LearningCanvasContent
  /** True when somebody else's changes had to be folded in. */
  foldedRemote: boolean
  /** Other people's items left out because the board is at its size limit. */
  dropped: number
}

interface SaveMergedInput {
  classId: string
  canvasId: string
  /** The last server state this editor built on. */
  base: LearningCanvasContent
  /** What this editor wants to save (already filtered to valid cards). */
  local: LearningCanvasContent
  /**
   * For a note opened in the whiteboard: refresh the canvas description (the preview shown in the
   * Notes list and graph) from the saved note card. Only the owner may write the description.
   */
  syncNoteDescription?: boolean
}

/**
 * Saves without ever overwriting another person's work. Inside one transaction it reads the newest
 * board, three-way merges it with this editor's changes, and writes the result. If somebody saved in
 * between, Firestore retries the transaction, so two people editing at once both keep their changes.
 */
export async function saveCanvasMerged(
  { classId, canvasId, base, local, syncNoteDescription = false }: SaveMergedInput,
  db: Firestore = firestore,
): Promise<SaveMergedResult> {
  const parentRef = learningCanvasRef(db, classId, canvasId)
  const contentRef = learningCanvasContentRef(db, classId, canvasId)

  return runTransaction(db, async (tx) => {
    const [parentSnap, contentSnap] = await Promise.all([tx.get(parentRef), tx.get(contentRef)])
    if (!parentSnap.exists()) throw new Error('Canvas not found.')
    parseLearningCanvasMetadata(parentSnap.data())

    const remote = contentSnap.exists()
      ? parseLearningCanvasContent(contentSnap.data())
      : { version: 1 as const, nodes: [], edges: [], viewport: local.viewport }

    const merged = mergeContent(base, local, remote)
    const content = parseLearningCanvasContent(merged.content)
    const foldedRemote = !sameBoard(content, local)

    if (contentSnap.exists() && sameBoard(content, remote)) {
      // Nothing new to write: the server already has everything this editor wanted.
      return { content: remote, foldedRemote, dropped: merged.dropped }
    }

    const stats = countStats(content.nodes, content.edges)
    // update() touches only the derived counters, which is all an invited editor may change.
    tx.update(parentRef, {
      nodeCount: stats.nodeCount,
      edgeCount: stats.edgeCount,
      refs: computeRefs(content.nodes),
      ...(syncNoteDescription ? { description: noteDescription(getNoteText(content)) } : {}),
      updatedAt: Timestamp.now(),
    })
    tx.set(contentRef, content)
    return { content, foldedRemote, dropped: merged.dropped }
  })
}
