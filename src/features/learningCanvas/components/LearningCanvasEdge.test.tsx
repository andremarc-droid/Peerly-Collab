import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Position } from '@xyflow/react'
import { LearningCanvasEdge } from './LearningCanvasEdge'

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="edge-label-renderer-portal">{children}</div>
    ),
  }
})

afterEach(cleanup)

describe('LearningCanvasEdge conditional EdgeLabelRenderer portal', () => {
  const defaultProps = {
    id: 'edge-1',
    source: 'n1',
    target: 'n2',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }

  it('skips mounting EdgeLabelRenderer portal when unselected and unlabeled', () => {
    render(
      <svg>
        <LearningCanvasEdge
          {...defaultProps}
          selected={false}
          data={{ label: undefined, readOnly: false }}
        />
      </svg>,
    )
    expect(screen.queryByTestId('edge-label-renderer-portal')).toBeNull()
    expect(screen.queryByRole('button', { name: /label/i })).toBeNull()
  })

  it('mounts EdgeLabelRenderer portal when edge has a label', () => {
    render(
      <svg>
        <LearningCanvasEdge
          {...defaultProps}
          selected={false}
          data={{ label: 'leads to', readOnly: false }}
        />
      </svg>,
    )
    expect(screen.getByTestId('edge-label-renderer-portal')).not.toBeNull()
    expect(screen.getByText('leads to')).not.toBeNull()
  })

  it('mounts EdgeLabelRenderer portal and controls when edge is selected', () => {
    render(
      <svg>
        <LearningCanvasEdge
          {...defaultProps}
          selected={true}
          data={{ label: undefined, readOnly: false }}
        />
      </svg>,
    )
    expect(screen.getByTestId('edge-label-renderer-portal')).not.toBeNull()
    expect(screen.getByRole('button', { name: '+ Label' })).not.toBeNull()
    expect(screen.getByRole('button', { name: /cycle arrow style/i })).not.toBeNull()
  })
})
