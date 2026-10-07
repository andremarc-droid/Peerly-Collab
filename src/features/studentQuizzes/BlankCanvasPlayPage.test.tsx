import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlankCanvasPlayPage } from './BlankCanvasPlayPage'
import type { CanvasQuestion } from '../canvas/types'
import type { BlankCanvasAnswer } from '../quizzes/types'

afterEach(() => {
  cleanup()
})

// Mock CanvasBoard
vi.mock('../canvas/components/CanvasBoard', () => ({
  default: ({ cards, onCardClick }: { cards: Array<{ id: string; title?: string }>; onCardClick?: (c: unknown) => void }) => (
    <div data-testid="canvas-board">
      {cards.map((c) => (
        <button key={c.id} data-testid={`card-${c.id}`} onClick={() => onCardClick?.(c)}>
          {c.title || c.id}
        </button>
      ))}
    </div>
  ),
}))

const question: CanvasQuestion & { id: string } = {
  id: 'board',
  type: 'canvas',
  order: 0,
  prompt: 'Build your photosynthesis diagram.',
  rubric: 'Must include chloroplasts and light reactions.',
  showRubricToStudents: true,
  points: 100,
  layoutMode: 'scattered',
  directed: false,
  wrongPenalty: 'none',
  cards: [],
  maxCards: 3,
  maxConnections: 2,
  allowedCardTypes: ['note', 'paragraph'],
}

describe('BlankCanvasPlayPage', () => {
  it('renders instructions and allowed card type buttons', () => {
    const onChange = vi.fn()
    render(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={{ cards: [], connections: [] }}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('Task Instructions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paragraph' })).toBeInTheDocument()
    // Link is not in allowedCardTypes
    expect(screen.queryByRole('button', { name: 'Link' })).not.toBeInTheDocument()
  })

  it('allows adding cards up to maxCards', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={{ cards: [], connections: [] }}
        onChange={onChange}
      />,
    )

    const addNoteBtn = screen.getByRole('button', { name: 'Note' })
    fireEvent.click(addNoteBtn)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ type: 'note' }),
        ]),
        connections: [],
      }),
    )

    // When at maxCards (3), button is disabled
    const currentAnswer: BlankCanvasAnswer = {
      cards: [
        { id: 'c1', type: 'note', title: 'T1', content: 'C1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'T2', content: 'C2', position: { x: 0, y: 0 } },
        { id: 'c3', type: 'note', title: 'T3', content: 'C3', position: { x: 0, y: 0 } },
      ],
      connections: [],
    }
    rerender(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={currentAnswer}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: 'Note' })).toBeDisabled()
  })

  it('connects two cards and normalizes undirected connection', () => {
    const onChange = vi.fn()
    const currentAnswer: BlankCanvasAnswer = {
      cards: [
        { id: 'beta', type: 'note', title: 'Beta', content: 'B', position: { x: 0, y: 0 } },
        { id: 'alpha', type: 'note', title: 'Alpha', content: 'A', position: { x: 0, y: 0 } },
      ],
      connections: [],
    }

    render(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={currentAnswer}
        onChange={onChange}
      />,
    )

    // Open connect dialog
    fireEvent.click(screen.getByRole('button', { name: /Connect cards/i }))
    expect(screen.getByRole('dialog', { name: 'Connect cards' })).toBeInTheDocument()

    // Select source and target
    fireEvent.change(screen.getByLabelText(/Source card/i), { target: { value: 'beta' } })
    fireEvent.change(screen.getByLabelText(/Target card/i), { target: { value: 'alpha' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }))

    // Directed is false, so alphabetical: 'alpha<->beta'
    expect(onChange).toHaveBeenCalledWith({
      cards: currentAnswer.cards,
      connections: ['alpha<->beta'],
    })
  })

  it('creates directed connection when directed is true', () => {
    const onChange = vi.fn()
    const currentAnswer: BlankCanvasAnswer = {
      cards: [
        { id: 'beta', type: 'note', title: 'Beta', content: 'B', position: { x: 0, y: 0 } },
        { id: 'alpha', type: 'note', title: 'Alpha', content: 'A', position: { x: 0, y: 0 } },
      ],
      connections: [],
    }

    render(
      <BlankCanvasPlayPage
        question={{ ...question, directed: true }}
        attemptId="att-1"
        value={currentAnswer}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Connect cards/i }))
    fireEvent.change(screen.getByLabelText(/Source card/i), { target: { value: 'beta' } })
    fireEvent.change(screen.getByLabelText(/Target card/i), { target: { value: 'alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create connection' }))

    // Directed is true, so directed: 'beta->alpha'
    expect(onChange).toHaveBeenCalledWith({
      cards: currentAnswer.cards,
      connections: ['beta->alpha'],
    })
  })

  it('collapses and expands the instructions panel', () => {
    render(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={{ cards: [], connections: [] }}
        onChange={vi.fn()}
      />,
    )

    // Instructions initially visible
    expect(screen.getByText('Build your photosynthesis diagram.')).toBeInTheDocument()

    // Collapse
    const collapseBtn = screen.getByRole('button', { name: /Hide details/i })
    fireEvent.click(collapseBtn)

    // Content hidden
    expect(screen.queryByText('Build your photosynthesis diagram.')).not.toBeInTheDocument()

    // Expand
    const expandBtn = screen.getByRole('button', { name: /View instructions/i })
    fireEvent.click(expandBtn)
    expect(screen.getByText('Build your photosynthesis diagram.')).toBeInTheDocument()
  })

  it('toggles expand board container', () => {
    render(
      <BlankCanvasPlayPage
        question={question}
        attemptId="att-1"
        value={{ cards: [], connections: [] }}
        onChange={vi.fn()}
      />,
    )

    const expandBtn = screen.getByRole('button', { name: /Expand board/i })
    expect(expandBtn).toBeInTheDocument()
    fireEvent.click(expandBtn)

    // After expanding, close or exit button is present
    expect(screen.getByRole('button', { name: /Exit full screen/i })).toBeInTheDocument()
  })
})
