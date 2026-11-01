import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningCanvas } from './LearningCanvas'
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
