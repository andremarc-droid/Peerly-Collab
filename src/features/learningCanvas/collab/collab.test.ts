import { describe, expect, it } from 'vitest'
import type { LearningCanvasContent, LearningCanvasTextNode } from '../types'
import { resolveAccess } from './access'
import { diffBoards, summarizeChanges } from './activity'
import { mergeContent } from './mergeContent'

function textNode(id: string, text: string): LearningCanvasTextNode {
  return { id, type: 'text', text, x: 0, y: 0, width: 240, height: 140, color: 'none' }
}

function board(nodes: LearningCanvasTextNode[]): LearningCanvasContent {
  return { version: 1, nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

describe('canvas collaboration', () => {
  it('keeps distinct simultaneous edits when merging a save', () => {
    const base = board([])
    const local = board([textNode('local', 'Mine')])
    const remote = board([textNode('remote', 'Theirs')])

    const result = mergeContent(base, local, remote)

    expect(result.content.nodes.map((node) => node.id)).toEqual(['local', 'remote'])
    expect(result.dropped).toBe(0)
  })

  it('prefers this editor for concurrent changes to the same card', () => {
    const base = board([textNode('shared', 'Before')])
    const local = board([textNode('shared', 'My edit')])
    const remote = board([textNode('shared', 'Their edit')])

    expect(mergeContent(base, local, remote).content.nodes).toEqual([textNode('shared', 'My edit')])
  })

  it('resolves owner, editor, viewer, and uninvited access explicitly', () => {
    const canvas = { ownerId: 'owner', kind: 'class' as const, status: 'draft' as const }

    expect(resolveAccess({ canvas, uid: 'owner', role: null })).toBe('owner')
    expect(resolveAccess({ canvas, uid: 'editor', role: 'editor' })).toBe('editor')
    expect(resolveAccess({ canvas, uid: 'viewer', role: 'viewer' })).toBe('viewer')
    expect(resolveAccess({ canvas, uid: 'outsider', role: null })).toBe('none')
  })

  it('creates concise activity entries from edits', () => {
    const before = board([])
    const after = board([textNode('new', 'Cell membrane')])
    const changes = diffBoards(before, after)

    expect(summarizeChanges(changes)).toEqual({
      summary: 'Added 1 card',
      lines: ['Added text card “Cell membrane”'],
    })
  })
})
