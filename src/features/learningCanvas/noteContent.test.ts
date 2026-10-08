import { describe, expect, it } from 'vitest'
import {
  NOTE_CONTENT_MAX,
  NOTE_NODE_ID,
  getNoteText,
  noteDescription,
  withNoteText,
} from './noteContent'
import type { LearningCanvasContent, LearningCanvasNode } from './types'

function text(id: string, value: string): LearningCanvasNode {
  return { id, type: 'text', text: value, x: 0, y: 0, width: 240, height: 140, color: 'none' }
}

function board(nodes: LearningCanvasNode[]): LearningCanvasContent {
  return { version: 1, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

describe('note content', () => {
  it('reads the full note text, not the 300 character preview', () => {
    const long = 'a'.repeat(1200)
    expect(getNoteText(board([text(NOTE_NODE_ID, long)]))).toHaveLength(1200)
    expect(noteDescription(long)).toHaveLength(300)
  })

  it('prefers the main note card over other text cards', () => {
    const content = board([text('other', 'Other'), text(NOTE_NODE_ID, 'Main')])
    expect(getNoteText(content)).toBe('Main')
  })

  it('falls back to the first text card, and to empty text when there is none', () => {
    expect(getNoteText(board([text('a', 'First'), text('b', 'Second')]))).toBe('First')
    expect(getNoteText(board([]))).toBe('')
    expect(getNoteText(null)).toBe('')
  })

  it('replaces the note text without touching other cards or mutating the input', () => {
    const original = board([text('other', 'Keep me'), text(NOTE_NODE_ID, 'Old')])
    const next = withNoteText(original, 'New')

    expect(getNoteText(next)).toBe('New')
    expect(next.nodes.find((node) => node.id === 'other')).toEqual(text('other', 'Keep me'))
    expect(getNoteText(original)).toBe('Old')
  })

  it('adds a note card when the board has none', () => {
    const next = withNoteText(board([]), 'Hello')
    expect(next.nodes).toHaveLength(1)
    expect(next.nodes[0]).toMatchObject({ id: NOTE_NODE_ID, type: 'text', text: 'Hello' })
  })

  it('limits the note text to the card maximum', () => {
    const next = withNoteText(board([]), 'x'.repeat(NOTE_CONTENT_MAX + 50))
    expect(getNoteText(next)).toHaveLength(NOTE_CONTENT_MAX)
  })
})
