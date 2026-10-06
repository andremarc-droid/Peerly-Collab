import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CanvasBoard from './CanvasBoard'
import type { CanvasCard, CanvasConnection } from '../types'

// Mock ResizeObserver for React Flow
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterEach(() => {
  cleanup()
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('CanvasBoard component', () => {
  const sampleCards: CanvasCard[] = [
    {
      id: 'c1',
      type: 'note',
      title: 'Birth in Calamba (1861)',
      content: 'Born on June 19, 1861.',
      position: { x: 0, y: 0 },
    },
    {
      id: 'c2',
      type: 'paragraph',
      title: 'Studies in Ateneo & UST',
      content: 'Excelled in philosophy and letters and ophthalmology.',
      position: { x: 250, y: 0 },
    },
    {
      id: 'c3',
      type: 'link',
      title: 'Noli Me Tangere',
      content: 'Published in Berlin in 1887.',
      url: 'https://nhcp.gov.ph/noli',
      position: { x: 500, y: 0 },
    },
  ]

  const sampleConnections: CanvasConnection[] = [
    { id: 'c1->c2', from: 'c1', to: 'c2' },
  ]

  it('renders the board with visible connection counter in play mode and renders card articles', () => {
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
        maxConnections={5}
      />,
    )

    expect(screen.getByText('Connections used 1 of 5')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Birth in Calamba/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Studies in Ateneo/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Noli Me Tangere/i })).toBeInTheDocument()
  })

  it('displays 44px control buttons with accessible labels', () => {
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
      />,
    )

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fit all cards in view' })).toBeInTheDocument()
  })

  it('renders review mode with read-only properties and renders cards without deletion capability', () => {
    const onCardsChange = vi.fn()
    const onConnectionsChange = vi.fn()

    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="review"
        onCardsChange={onCardsChange}
        onConnectionsChange={onConnectionsChange}
      />,
    )

    const card = screen.getAllByTestId('card-c1')[0]
    expect(card).toBeInTheDocument()
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Delete', code: 'Delete' })

    expect(onCardsChange).not.toHaveBeenCalled()
    expect(onConnectionsChange).not.toHaveBeenCalled()
  })

  it('enforces connection cap and announces limit reached', () => {
    const onConnectionsChange = vi.fn()

    // Render with maxConnections = 1 and already 1 connection
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
        maxConnections={1}
        onConnectionsChange={onConnectionsChange}
      />,
    )

    expect(screen.getByText('Connections used 1 of 1')).toBeInTheDocument()
  })

  it('in play mode, card content is read-only with no editable inputs or textareas', () => {
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
      />,
    )

    expect(screen.getByText('Born on June 19, 1861.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('in review mode, renders the board with review configuration and hides connections counter', () => {
    const { container } = render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="review"
        maxConnections={5}
        statusByConnection={{ 'c1->c2': 'correct' }}
      />,
    )

    expect(container.querySelector('.canvas-board-wrapper')).toBeInTheDocument()
    expect(screen.getByTestId('card-c1')).toBeInTheDocument()
    expect(screen.queryByText(/Connections used/i)).not.toBeInTheDocument()
  })

  it('shows connections counter in edit and play modes', () => {
    const { rerender } = render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="edit"
        maxConnections={5}
      />,
    )
    expect(screen.getByText('Connections used 1 of 5')).toBeInTheDocument()

    rerender(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
        maxConnections={5}
      />,
    )
    expect(screen.getByText('Connections used 1 of 5')).toBeInTheDocument()
  })

  it('updates card content when card props change without count changes', () => {
    const { rerender } = render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="edit"
      />,
    )
    expect(screen.getByText('Born on June 19, 1861.')).toBeInTheDocument()

    const modifiedCards = sampleCards.map((c) =>
      c.id === 'c1' ? { ...c, content: 'Updated biographical details.' } : c,
    )

    rerender(
      <CanvasBoard
        cards={modifiedCards}
        connections={sampleConnections}
        mode="edit"
      />,
    )
    expect(screen.getByText('Updated biographical details.')).toBeInTheDocument()
  })

  it('in play mode, cards cannot be deleted', () => {
    const onCardsChange = vi.fn()
    render(
      <CanvasBoard
        cards={sampleCards}
        connections={sampleConnections}
        mode="play"
        onCardsChange={onCardsChange}
      />,
    )

    const card = screen.getAllByTestId('card-c1')[0]
    expect(card).toBeInTheDocument()
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Delete', code: 'Delete' })
    fireEvent.keyDown(card, { key: 'Backspace', code: 'Backspace' })

    expect(onCardsChange).not.toHaveBeenCalled()
  })
})

