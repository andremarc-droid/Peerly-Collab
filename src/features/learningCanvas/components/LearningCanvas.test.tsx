import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider, useStoreApi, type NodeProps } from '@xyflow/react'
import { LearningCanvas } from './LearningCanvas'
import { TextCard, type TextCardData } from './TextCard'
import type { LearningCanvasContent } from '../types'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const sampleContent: LearningCanvasContent = {
  version: 1,
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 50,
      y: 50,
      width: 240,
      height: 140,
      color: 'none',
      text: 'First card',
    },
    {
      id: 'node-2',
      type: 'text',
      x: 350,
      y: 50,
      width: 240,
      height: 140,
      color: 'tint',
      text: 'Second card',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      from: 'node-1',
      to: 'node-2',
      arrow: 'to',
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
}

function ZoomHarness({
  initialZoom,
  onStoreReady,
  children,
}: {
  initialZoom: number
  onStoreReady?: (setZoom: (z: number) => void) => void
  children: React.ReactNode
}) {
  const store = useStoreApi()
  const initializedRef = { current: false }
  if (!initializedRef.current) {
    initializedRef.current = true
    store.setState({ transform: [0, 0, initialZoom] })
    onStoreReady?.((z: number) => {
      store.setState({ transform: [0, 0, z] })
    })
  }
  return <>{children}</>
}

function makeTextCardProps(overrides?: Partial<NodeProps & { data: TextCardData }>): NodeProps & { data: TextCardData } {
  return {
    id: 'tc-1',
    type: 'text',
    data: {
      text: 'Sample markdown text',
      color: 'none',
      readOnly: false,
    },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    ...overrides,
  }
}

describe('LearningCanvas component rendering', () => {
  it('renders the canvas root container, toolbar, and board', () => {
    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Test Board"
          initialContent={sampleContent}
        />
      </div>,
    )
    expect(screen.getByTestId('learning-canvas-root')).not.toBeNull()
    expect(screen.getByTestId('learning-canvas-board')).not.toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Learning canvas whiteboard tools' })).not.toBeNull()
  })

  it('renders cards in non-test or test environment without being culled', () => {
    render(
      <div className="w-[800px] h-[600px]">
        <LearningCanvas
          title="Test Board"
          initialContent={sampleContent}
        />
      </div>,
    )
    expect(screen.getByTestId('text-card-node-1')).not.toBeNull()
    expect(screen.getByTestId('text-card-node-2')).not.toBeNull()
  })
})

describe('TextCard low-detail (LOD) handle retention', () => {
  it('renders all 4 connection handles when zoom < 0.5 and card is unselected', () => {
    render(
      <ReactFlowProvider>
        <ZoomHarness initialZoom={0.35}>
          <TextCard {...makeTextCardProps({ selected: false })} />
        </ZoomHarness>
      </ReactFlowProvider>,
    )

    const card = screen.getByTestId('text-card-tc-1')
    expect(card.classList.contains('learning-card--lod')).toBe(true)

    const handles = card.querySelectorAll('.canvas-handle')
    expect(handles.length).toBe(4)
    expect(card.querySelector('[data-handleid="top"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="right"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="bottom"]')).not.toBeNull()
    expect(card.querySelector('[data-handleid="left"]')).not.toBeNull()
  })

  it('does not remove handle DOM nodes when crossing the 0.5 LOD zoom threshold', () => {
    let setZoom: (z: number) => void = () => {}
    render(
      <ReactFlowProvider>
        <ZoomHarness
          initialZoom={1}
          onStoreReady={(fn) => {
            setZoom = fn
          }}
        >
          <TextCard {...makeTextCardProps({ selected: false })} />
        </ZoomHarness>
      </ReactFlowProvider>,
    )

    const card = screen.getByTestId('text-card-tc-1')
    expect(card.classList.contains('learning-card--lod')).toBe(false)
    const initialHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(initialHandles.length).toBe(4)

    // Cross below 0.5 zoom into low-detail mode
    act(() => {
      setZoom(0.3)
    })
    expect(card.classList.contains('learning-card--lod')).toBe(true)
    const lodHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(lodHandles.length).toBe(4)
    // Verify the exact same DOM elements remain mounted
    lodHandles.forEach((handle, idx) => {
      expect(handle).toBe(initialHandles[idx])
    })

    // Cross back above 0.5 zoom
    act(() => {
      setZoom(1)
    })
    expect(card.classList.contains('learning-card--lod')).toBe(false)
    const restoredHandles = Array.from(card.querySelectorAll('.canvas-handle'))
    expect(restoredHandles.length).toBe(4)
    restoredHandles.forEach((handle, idx) => {
      expect(handle).toBe(initialHandles[idx])
    })
  })
})