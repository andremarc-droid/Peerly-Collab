import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Position } from '@xyflow/react'

// Mock EdgeLabelRenderer so portal renders inline in jsdom unit tests
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="edge-label-renderer">{children}</div>
    ),
  }
})

import { CanvasEdge } from './CanvasEdge'

function renderEdge(props: any) {
  return render(
    <svg>
      <CanvasEdge
        id="e1"
        source="c1"
        target="c2"
        sourceX={0}
        sourceY={50}
        targetX={200}
        targetY={50}
        sourcePosition={Position.Right}
        targetPosition={Position.Left}
        selected={false}
        animated={false}
        interactionWidth={20}
        {...props}
      />
    </svg>,
  )
}

describe('CanvasEdge component', () => {
  afterEach(() => {
    cleanup()
  })
  it('renders correct status badge with Check icon and Correct text label', () => {
    renderEdge({
      data: { status: 'correct', from: 'c1', to: 'c2' },
    })
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('canvas-edge-badge--correct')
  })

  it('renders wrong status badge with X icon and Incorrect text label', () => {
    renderEdge({
      data: { status: 'wrong', from: 'c1', to: 'c2' },
    })
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('canvas-edge-badge--wrong')
  })

  it('renders missed status badge with icon and Missed text label', () => {
    renderEdge({
      data: { status: 'missed', from: 'c1', to: 'c2' },
    })
    expect(screen.getByText('Missed')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('canvas-edge-badge--missed')
  })

  it('renders optional label when provided and no status', () => {
    renderEdge({
      data: { label: 'leads to', from: 'c1', to: 'c2' },
    })
    expect(screen.getByText('leads to')).toBeInTheDocument()
  })

  it('renders clear selected state when selected is true', () => {
    const { container } = renderEdge({
      selected: true,
      data: { from: 'c1', to: 'c2' },
    })
    const path = container.querySelector('.canvas-edge__path')
    expect(path).toHaveClass('is-selected')
  })
})
