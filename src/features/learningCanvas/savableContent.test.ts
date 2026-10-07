import { describe, expect, it } from 'vitest'
import { toSavableContent } from './savableContent'
import { parseLearningCanvasContent } from './schemas'
import type { LearningCanvasContent, LearningCanvasNode } from './types'

const box = { x: 0, y: 0, width: 240, height: 140, color: 'none' as const }

const text: LearningCanvasNode = { ...box, id: 't1', type: 'text', text: 'hello' }
const emptyLink: LearningCanvasNode = {
  ...box,
  id: 'l1',
  type: 'link',
  link: { url: 'https://', title: '' },
}
const goodLink: LearningCanvasNode = {
  ...box,
  id: 'l2',
  type: 'link',
  link: { url: 'https://example.com', title: 'Example' },
}
const emptyRef: LearningCanvasNode = {
  ...box,
  id: 'r1',
  type: 'reference',
  reference: { refType: 'module', refId: '' },
}

function content(nodes: LearningCanvasNode[], edges: LearningCanvasContent['edges'] = []): LearningCanvasContent {
  return { version: 1, nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}

describe('toSavableContent', () => {
  it('drops half-finished cards so they cannot block saving the rest of the board', () => {
    const board = content([text, emptyLink, goodLink, emptyRef])

    // the raw board would be rejected by the persistence rules...
    expect(() => parseLearningCanvasContent(board)).toThrow()

    // ...but the savable version passes and keeps everything that is complete
    const savable = toSavableContent(board)
    expect(savable.nodes.map((n) => n.id)).toEqual(['t1', 'l2'])
    expect(() => parseLearningCanvasContent(savable)).not.toThrow()
  })

  it('drops edges that touch dropped cards, self-edges and duplicate connections', () => {
    const board = content(
      [text, goodLink, emptyLink],
      [
        { id: 'e1', from: 't1', to: 'l2', arrow: 'to' },
        { id: 'e2', from: 't1', to: 'l1', arrow: 'to' }, // target dropped
        { id: 'e3', from: 't1', to: 't1', arrow: 'to' }, // self edge
        { id: 'e4', from: 't1', to: 'l2', arrow: 'both' }, // duplicate connection
      ],
    )
    const savable = toSavableContent(board)
    expect(savable.edges.map((e) => e.id)).toEqual(['e1'])
    expect(() => parseLearningCanvasContent(savable)).not.toThrow()
  })

  it('leaves valid content unchanged', () => {
    const board = content([text, goodLink], [{ id: 'e1', from: 't1', to: 'l2', arrow: 'to' }])
    expect(toSavableContent(board)).toEqual(board)
  })
})
