import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CanvasBoard from './CanvasBoard'
import type { CanvasCard } from '../types'

let lastCapturedProps: any = null

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    ReactFlow: (props: any) => {
      lastCapturedProps = props
      return <div data-testid="mock-reactflow">{props.children}</div>
    },
  }
})

afterEach(() => {
  cleanup()
  lastCapturedProps = null
})

const sampleCards: CanvasCard[] = [
  { id: 'c1', type: 'note', title: 'Card 1', content: 'Content 1', position: { x: 0, y: 0 } },
  { id: 'c2', type: 'paragraph', title: 'Card 2', content: 'Content 2', position: { x: 250, y: 0 } },
  { id: 'c3', type: 'link', title: 'Card 3', content: 'Content 3', position: { x: 500, y: 0 } },
]

describe('CanvasBoard directed and undirected mutations', () => {
  it('directed board: handles connect, edge delete, and card delete in edit mode', () => {
    const onConnectionsChange = vi.fn()
    const onCardsChange = vi.fn()

    render(
      <CanvasBoard
        cards={sampleCards}
        connections={['c1->c2']}
        directed={true}
        mode="edit"
        onConnectionsChange={onConnectionsChange}
        onCardsChange={onCardsChange}
      />,
    )

    expect(lastCapturedProps).not.toBeNull()

    // 1. Connect c1 -> c3
    lastCapturedProps.onConnect({ source: 'c1', target: 'c3' })
    expect(onConnectionsChange).toHaveBeenCalledWith([
      { id: 'c1->c2', from: 'c1', to: 'c2' },
      { id: 'c1->c3', from: 'c1', to: 'c3' },
    ])

    // 2. Delete edge c1->c2
    lastCapturedProps.onEdgesDelete([{ id: 'c1->c2' }])
    expect(onConnectionsChange).toHaveBeenCalledWith([])

    // 3. Delete node c1 in edit mode: removes card and edge touching c1
    lastCapturedProps.onNodesDelete([{ id: 'c1' }])
    expect(onCardsChange).toHaveBeenCalledWith([sampleCards[1], sampleCards[2]])
    expect(onConnectionsChange).toHaveBeenCalledWith([])
  })

  it('undirected board: handles connect, duplicate detection across order, edge delete, and card delete', () => {
    const onConnectionsChange = vi.fn()
    const onCardsChange = vi.fn()

    render(
      <CanvasBoard
        cards={sampleCards}
        connections={['c1<->c2']}
        directed={false}
        mode="edit"
        onConnectionsChange={onConnectionsChange}
        onCardsChange={onCardsChange}
      />,
    )

    expect(lastCapturedProps).not.toBeNull()

    // 1. Inverted connection c2 to c1 is recognized as duplicate of c1<->c2 and ignored
    lastCapturedProps.onConnect({ source: 'c2', target: 'c1' })
    expect(onConnectionsChange).not.toHaveBeenCalled()

    // 2. Connect c3 to c1: adds normalized c1<->c3 with canonical ID and endpoints without corruption
    lastCapturedProps.onConnect({ source: 'c3', target: 'c1' })
    expect(onConnectionsChange).toHaveBeenCalledWith([
      { id: 'c1<->c2', from: 'c1', to: 'c2' },
      { id: 'c1<->c3', from: 'c3', to: 'c1' },
    ])

    // 3. Delete edge c1<->c2
    lastCapturedProps.onEdgesDelete([{ id: 'c1<->c2' }])
    expect(onConnectionsChange).toHaveBeenCalledWith([])

    // 4. Delete node c2 in edit mode: removes card c2 and edge c1<->c2
    lastCapturedProps.onNodesDelete([{ id: 'c2' }])
    expect(onCardsChange).toHaveBeenCalledWith([sampleCards[0], sampleCards[2]])
    expect(onConnectionsChange).toHaveBeenCalledWith([])
  })

  it('drops corrupted string connections without crashing', () => {
    const onConnectionsChange = vi.fn()
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={['c1<->c2', 'corrupted<', 'bad->']}
        directed={false}
        mode="edit"
        onConnectionsChange={onConnectionsChange}
      />,
    )

    // Connect new edge: unparseable strings are filtered out
    lastCapturedProps.onConnect({ source: 'c1', target: 'c3' })
    expect(onConnectionsChange).toHaveBeenCalledWith([
      { id: 'c1<->c2', from: 'c1', to: 'c2' },
      { id: 'c1<->c3', from: 'c1', to: 'c3' },
    ])
  })
})
