import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CanvasPlayPage from './CanvasPlayPage'
import { sanitizeCanvasAnswers } from '../canvas/mapping'
import type { CanvasQuestion } from '../canvas/types'
import { scatterCards } from '../canvas/schemas'

const imageMocks = vi.hoisted(() => ({
  listImages: vi.fn(),
}))

vi.mock('../canvas/imageService', () => ({
  listImages: imageMocks.listImages,
}))

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
    const fortyCards = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`,
      type: 'note' as const,
      content: `Card ${i}`,
      position: { x: 0, y: 0 },
    }))
    const eightyConnections: string[] = []
    for (let i = 0; i < 40 && eightyConnections.length < 80; i += 1) {
      for (let j = 0; j < 40 && eightyConnections.length < 80; j += 1) {
        if (i !== j) eightyConnections.push(`c${i}->c${j}`)
      }
    }
    const questionWithCards = {
      ...sampleQuestion,
      cards: fortyCards,
    }
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={questionWithCards}
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

  it('undirected board: adds connection in canonical order, prevents reverse duplicate, and removes connection', () => {
    const undirectedQuestion: CanvasQuestion & { id: string } = {
      ...sampleQuestion,
      directed: false,
    }
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={undirectedQuestion}
        attemptId="attempt-undir"
        connections={[]}
        onChange={onChange}
      />,
    )

    // Open connect modal
    const connectButtons = screen.getAllByRole('button', { name: /Connect cards/i })
    fireEvent.click(connectButtons[0]!)

    // Select c2 -> c1 (inverted)
    fireEvent.change(screen.getByLabelText(/From card/i), { target: { value: 'c2' } })
    fireEvent.change(screen.getByLabelText(/To card/i), { target: { value: 'c1' } })

    fireEvent.click(screen.getByRole('button', { name: /Create connection/i }))

    // Normalizes to canonical 'c1<->c2'
    expect(onChange).toHaveBeenCalledWith(['c1<->c2'])
  })

  it('repairs corrupted saved answers on resume and sanitizes invalid card ids', () => {
    const undirectedQuestion: CanvasQuestion & { id: string } = {
      ...sampleQuestion,
      directed: false,
    }
    const onChange = vi.fn()

    // Pass corrupted saved answers:
    // 'c1<' (corrupted split artifact)
    // 'c2<->c1' (un-normalized order)
    // 'c1<->c999' (non-existent card)
    // 'c1->c2' (directed format on undirected board)
    const corruptedSaved = ['c1<', 'c2<->c1', 'c1<->c999', 'c1->c2']

    render(
      <CanvasPlayPage
        question={undirectedQuestion}
        attemptId="attempt-repair"
        connections={corruptedSaved}
        onChange={onChange}
      />,
    )

    // The component repairs and dedupes the answer to ['c1<->c2']
    expect(onChange).toHaveBeenCalledWith(['c1<->c2'])
  })

  it('sanitizeCanvasAnswers pure function handles parsing, filtering, re-normalization, deduplication and cap', () => {
    const validCards = new Set(['c1', 'c2', 'c3'])

    // Undirected
    const sanitizedUndir = sanitizeCanvasAnswers(
      ['c2<->c1', 'corrupted<', 'c1<->c99', 'c1->c2', 'c1<->c1'],
      validCards,
      false,
    )
    expect(sanitizedUndir).toEqual(['c1<->c2'])

    // Directed
    const sanitizedDir = sanitizeCanvasAnswers(
      ['c2->c1', 'c1->c2', 'c1<->c2', 'bad'],
      validCards,
      true,
    )
    expect(sanitizedDir).toEqual(['c2->c1', 'c1->c2'])

    // Object support
    const fromObjects = sanitizeCanvasAnswers(
      [{ id: 'x', from: 'c3', to: 'c1' }],
      validCards,
      false,
    )
    expect(fromObjects).toEqual(['c1<->c3'])
  })

  it('renders image cards with fetched images, handles missing image fallback, and shows retry on error', async () => {
    const questionWithImages: CanvasQuestion & { id: string } = {
      ...sampleQuestion,
      cards: [
        { id: 'c1', type: 'image', title: 'Chloroplast', content: '', imageId: 'img_chloro', alt: 'Chloroplast organelle diagram', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'image', title: 'Mitochondria', content: '', imageId: 'img_missing', alt: 'Mitochondria cross section', position: { x: 100, y: 0 } },
      ],
    }

    imageMocks.listImages.mockResolvedValueOnce([
      {
        id: 'img_chloro',
        data: 'ZmFrZS1pbWFnZS1kYXRh',
        mimeType: 'image/jpeg',
        width: 600,
        height: 400,
        bytes: 2048,
        createdAt: null,
      },
    ])

    const onChange = vi.fn()
    const { rerender } = render(
      <CanvasPlayPage
        question={questionWithImages}
        quizId="quiz-img-play"
        attemptId="attempt-img-play"
        connections={[]}
        onChange={onChange}
      />,
    )

    // Loaded image card should render img element
    const chloroImg = await screen.findByAltText('Chloroplast organelle diagram')
    expect(chloroImg).toBeInTheDocument()
    expect(chloroImg).toHaveAttribute('src', 'data:image/jpeg;base64,ZmFrZS1pbWFnZS1kYXRh')

    // Missing image should display "Image unavailable" fallback with alt text
    expect(screen.getByText('Image unavailable')).toBeInTheDocument()
    expect(screen.getByText('Mitochondria cross section')).toBeInTheDocument()

    // Test error case with retry note
    imageMocks.listImages.mockRejectedValueOnce(new Error('Network error'))

    rerender(
      <CanvasPlayPage
        question={questionWithImages}
        quizId="quiz-img-err"
        attemptId="attempt-img-err"
        connections={[]}
        onChange={onChange}
      />,
    )

    // Retry note should appear and not block the board
    expect(await screen.findByText('Some board images could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders the activity instructions banner when showInstructions is true', () => {
    const onChange = vi.fn()
    render(
      <CanvasPlayPage
        question={sampleQuestion}
        attemptId="attempt-instructions-play"
        connections={[]}
        onChange={onChange}
        showInstructions={true}
      />,
    )

    expect(screen.getByRole('region', { name: 'Activity instructions' })).toBeInTheDocument()
    expect(screen.getByText('Instructions')).toBeInTheDocument()
    expect(screen.getByText(sampleQuestion.prompt)).toBeInTheDocument()
  })
})

