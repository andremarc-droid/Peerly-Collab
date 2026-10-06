import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import CanvasReviewView from './CanvasReviewView'
import type { CanvasAnswerKey, CanvasQuestion } from '../types'

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

const question: CanvasQuestion = {
  order: 0,
  type: 'canvas',
  prompt: 'Connect the matching concepts.',
  points: 100,
  layoutMode: 'scattered',
  directed: true,
  wrongPenalty: 'half',
  cards: [
    { id: 'c1', type: 'note', title: 'Cell Wall', content: 'Plant structure', position: { x: 0, y: 0 } },
    { id: 'c2', type: 'note', title: 'Chloroplast', content: 'Photosynthesis', position: { x: 100, y: 0 } },
    { id: 'c3', type: 'paragraph', title: 'Mitochondria', content: 'Cellular respiration', position: { x: 200, y: 0 } },
    { id: 'c4', type: 'paragraph', title: 'Centriole', content: 'Animal division', position: { x: 300, y: 0 } },
  ],
}

const answerKey: CanvasAnswerKey = {
  type: 'canvas',
  explanation: 'Plant-specific organelles are cell wall and chloroplast.',
  connections: [
    { id: 'c1->c2', from: 'c1', to: 'c2', points: 1 },
    { id: 'c2->c3', from: 'c2', to: 'c3', points: 1 },
  ],
}

describe('CanvasReviewView component', () => {
  it('renders correct, missed, and incorrect connections with text labels and icons', () => {
    // Student submitted:
    // c1->c2 (correct, matches key)
    // c1->c4 (wrong, not in key)
    // missed by student: c2->c3 (in key, not submitted)
    const studentAnswer = ['c1->c2', 'c1->c4']

    render(
      <CanvasReviewView
        question={question}
        attemptId="attempt-rev-1"
        studentAnswer={studentAnswer}
        answerKey={answerKey}
      />,
    )

    // Summary counts
    expect(screen.getByText('1 correct')).toBeInTheDocument()
    expect(screen.getByText('1 incorrect')).toBeInTheDocument()
    expect(screen.getByText('1 missed')).toBeInTheDocument()

    // Status badges in the companion list
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()

    // Card titles in breakdown
    expect(screen.getAllByText('Cell Wall').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Chloroplast').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Mitochondria')).toBeInTheDocument()
    expect(screen.getByText('Centriole')).toBeInTheDocument()

    // Explanation
    expect(screen.getByText(/Plant-specific organelles are cell wall and chloroplast/i)).toBeInTheDocument()
  })

  it('handles empty student submission with all key connections marked missed', () => {
    render(
      <CanvasReviewView
        question={question}
        attemptId="attempt-rev-empty"
        studentAnswer={[]}
        answerKey={answerKey}
      />,
    )

    expect(screen.getByText('0 correct')).toBeInTheDocument()
    expect(screen.getByText('0 incorrect')).toBeInTheDocument()
    expect(screen.getByText('2 missed')).toBeInTheDocument()
  })

  it('renders undirected question connections with appropriate separator', () => {
    const undirectedQuestion: CanvasQuestion = {
      ...question,
      directed: false,
    }
    const undirectedKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'c1<->c2', from: 'c1', to: 'c2' }],
    }

    render(
      <CanvasReviewView
        question={undirectedQuestion}
        attemptId="attempt-undirected"
        studentAnswer={['c1<->c2']}
        answerKey={undirectedKey}
      />,
    )

    expect(screen.getByText('1 correct')).toBeInTheDocument()
    expect(screen.getByText('0 incorrect')).toBeInTheDocument()
    expect(screen.getByText('0 missed')).toBeInTheDocument()
  })
})
