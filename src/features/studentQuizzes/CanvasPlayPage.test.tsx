import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CanvasPlayPage from './CanvasPlayPage'
import type { CanvasQuestion } from '../canvas/types'
import { scatterCards } from '../canvas/schemas'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const sampleQuestion: CanvasQuestion & { id: string } = {
  id: 'board',
  type: 'canvas',
  order: 0,
  prompt: 'Connect concepts in cellular respiration.',
  points: 100,
  layoutMode: 'scattered',
  directed: true,
  wrongPenalty: 'half',
  cards: [
    { id: 'c1', type: 'note', title: 'Glycolysis', content: 'Cytoplasm pathway', position: { x: 50, y: 50 } },
    { id: 'c2', type: 'note', title: 'Krebs Cycle', content: 'Mitochondrial matrix', position: { x: 300, y: 50 } },
    { id: 'c3', type: 'paragraph', title: 'ETC', content: 'Inner membrane', position: { x: 550, y: 50 } },
  ],
}

describe('CanvasPlayPage component', () => {
  it('renders cards, prompt, and live connections counter', async () => {
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={['c1->c2']}
        onChange={onChange}
      />,
    )

    // Verify card titles appear in the connections list or controls
    expect(screen.getByText('Connections (1 of 80)')).toBeInTheDocument()
    expect(screen.getByText('Glycolysis')).toBeInTheDocument()
    expect(screen.getByText('Krebs Cycle')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove connection between Glycolysis and Krebs Cycle/i })).toBeInTheDocument()
  })

  it('scatters cards deterministically based on attemptId seed', () => {
    const cards = sampleQuestion.cards
    const scattered1 = scatterCards(cards, 'attempt-seed-A', { width: 1200, height: 900 })
    const scattered2 = scatterCards(cards, 'attempt-seed-A', { width: 1200, height: 900 })
    const scattered3 = scatterCards(cards, 'attempt-seed-B', { width: 1200, height: 900 })

    expect(scattered1.map((c) => c.position)).toEqual(scattered2.map((c) => c.position))
    expect(scattered1.map((c) => c.position)).not.toEqual(scattered3.map((c) => c.position))
  })

  it('respects fixed layout mode and does not jitter positions', () => {
    const fixedQuestion: CanvasQuestion & { id: string } = {
      ...sampleQuestion,
      layoutMode: 'fixed',
    }
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={fixedQuestion}
        attemptId="attempt-456"
        connections={[]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Connections (0 of 80)')).toBeInTheDocument()
  })

  it('allows adding connections using the accessible Connect cards dialog', () => {
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={[]}
        onChange={onChange}
      />,
    )

    // Click "Connect cards" to open dialog
    const connectButtons = screen.getAllByRole('button', { name: /Connect cards/i })
    fireEvent.click(connectButtons[0]!)

    // Dialog should open
    expect(screen.getByText('Select a source card and target card to create a connection.')).toBeInTheDocument()

    // Select source and target
    const fromSelect = screen.getByLabelText(/From card/i)
    const toSelect = screen.getByLabelText(/To card/i)

    fireEvent.change(fromSelect, { target: { value: 'c1' } })
    fireEvent.change(toSelect, { target: { value: 'c2' } })

    // Click "Create connection"
    const submitBtn = screen.getByRole('button', { name: /Create connection/i })
    fireEvent.click(submitBtn)

    expect(onChange).toHaveBeenCalledWith(['c1->c2'])
    // Polite live region should announce connection
    expect(screen.getByText(/Connected Glycolysis to Krebs Cycle/i)).toBeInTheDocument()
  })

  it('prevents duplicate connections and self-connections in the dialog', () => {
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={['c1->c2']}
        onChange={onChange}
      />,
    )

    const connectButtons = screen.getAllByRole('button', { name: /Connect cards/i })
    fireEvent.click(connectButtons[0]!)

    const fromSelect = screen.getByLabelText(/From card/i)
    const toSelect = screen.getByLabelText(/To card/i)

    // 1. Duplicate
    fireEvent.change(fromSelect, { target: { value: 'c1' } })
    fireEvent.change(toSelect, { target: { value: 'c2' } })
    const submitBtn = screen.getByRole('button', { name: /Create connection/i })
    fireEvent.click(submitBtn)

    expect(screen.getByText('These cards are already connected.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    // 2. Self connection disabled
    fireEvent.change(toSelect, { target: { value: 'c1' } })
    expect(submitBtn).toBeDisabled()
  })

  it('allows removing a connection via the list button with polite live announcement', () => {
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={['c1->c2', 'c2->c3']}
        onChange={onChange}
      />,
    )

    const removeBtn = screen.getByRole('button', { name: /Remove connection between Glycolysis and Krebs Cycle/i })
    fireEvent.click(removeBtn)

    expect(onChange).toHaveBeenCalledWith(['c2->c3'])
    expect(screen.getByText(/Removed connection between Glycolysis and Krebs Cycle/i)).toBeInTheDocument()
  })

  it('restores saved connections on resume', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={[]}
        onChange={onChange}
      />,
    )

    expect(screen.getByText(/No connections made yet/i)).toBeInTheDocument()

    // Simulate resuming with saved connections
    rerender(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={['c1->c2', 'c2->c3']}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Connections (2 of 80)')).toBeInTheDocument()
    expect(screen.getByText('Glycolysis')).toBeInTheDocument()
    expect(screen.getByText('ETC')).toBeInTheDocument()
  })

  it('caps connections at 80 and disables adding more in the dialog', () => {
    const eightyConnections = Array.from({ length: 80 }, (_, i) => `c1->c${i}`)
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-123"
        connections={eightyConnections}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Connections (80 of 80)')).toBeInTheDocument()
    const connectButtons = screen.getAllByRole('button', { name: /Connect cards/i })
    // All connect buttons disabled at cap
    connectButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })
})
