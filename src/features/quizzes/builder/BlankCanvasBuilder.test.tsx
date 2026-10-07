import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { QuizRecord } from '../services/quizService'
import { BlankCanvasBuilder } from './BlankCanvasBuilder'

afterEach(() => {
  cleanup()
})

const quiz: QuizRecord = {
  id: 'quiz-blank-1',
  ownerId: 'teacher-1',
  ownerName: 'Teacher',
  title: 'Blank Concept Map',
  description: 'Test blank canvas',
  tags: [],
  mode: 'canvas',
  boardKind: 'blank',
  status: 'draft',
  questionCount: 0,
  classId: 'class-1',
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  publishedAt: null,

  settings: {
    answerReveal: 'after_submit',
    participation: { type: 'individual' },
    scoreVisibility: 'immediate',
    scoresReleased: true,
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    shuffleQuestions: false,
    shuffleOptions: false,
  },
}

const mocked = vi.hoisted(() => ({
  showToast: vi.fn(),
  getQuiz: vi.fn(async () => quiz),
  getQuestionWithKey: vi.fn(async () => null),
  saveQuestionAndKey: vi.fn(async () => 'board'),
  updateQuiz: vi.fn(async () => undefined),
  publishQuiz: vi.fn(async () => undefined),
  unpublishQuiz: vi.fn(async () => undefined),
}))

vi.mock('../../../app/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../shared/ui/useToast', () => ({
  useToast: () => ({ showToast: mocked.showToast }),
}))

vi.mock('../services/questionService', () => ({
  getQuestionWithKey: mocked.getQuestionWithKey,
  saveQuestionAndKey: mocked.saveQuestionAndKey,
}))

vi.mock('../services/quizService', () => ({
  getQuiz: mocked.getQuiz,
  updateQuiz: mocked.updateQuiz,
  publishQuiz: mocked.publishQuiz,
  unpublishQuiz: mocked.unpublishQuiz,
}))

describe('BlankCanvasBuilder', () => {
  it('renders blank canvas configuration form', async () => {
    render(
      <MemoryRouter>
        <BlankCanvasBuilder quizId="quiz-blank-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/Activity instructions/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Rubric/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Show rubric to students/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Points/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Card limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Connection limit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Note card/i)).toBeInTheDocument()
  })

  it('validates instructions and saves blank canvas question', async () => {
    mocked.saveQuestionAndKey.mockClear()
    mocked.updateQuiz.mockClear()

    render(
      <MemoryRouter>
        <BlankCanvasBuilder quizId="quiz-blank-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/Activity instructions/i)).toBeInTheDocument()

    // Fill instructions
    const promptInput = screen.getByLabelText(/Activity instructions/i)
    fireEvent.change(promptInput, { target: { value: 'Explain cellular respiration.' } })

    // Fill rubric
    const rubricInput = screen.getByRole('textbox', { name: /Rubric/i })
    fireEvent.change(rubricInput, { target: { value: 'Must include glycolysis, Krebs cycle, and ETC.' } })

    // Click Save
    const saveBtn = screen.getByRole('button', { name: /Save blank canvas/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mocked.saveQuestionAndKey).toHaveBeenCalledWith(
        'quiz-blank-1',
        'board',
        expect.objectContaining({
          type: 'canvas',
          prompt: 'Explain cellular respiration.',
          rubric: 'Must include glycolysis, Krebs cycle, and ETC.',
          showRubricToStudents: true,
          cards: [],
          maxCards: 20,
          maxConnections: 40,
        }),
        null,
        expect.objectContaining({
          boardKind: 'blank',
        }),
      )
    })
  })

  it('configures and saves directed connections mode', async () => {
    mocked.saveQuestionAndKey.mockClear()

    render(
      <MemoryRouter>
        <BlankCanvasBuilder quizId="quiz-blank-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/Activity instructions/i)).toBeInTheDocument()

    // Fill instructions
    fireEvent.change(screen.getByLabelText(/Activity instructions/i), {
      target: { value: 'Draw directed flowchart.' },
    })

    // Switch to Directed
    const directedBtn = screen.getByRole('button', { name: /^Directed/i })
    fireEvent.click(directedBtn)

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Save blank canvas/i }))

    await waitFor(() => {
      expect(mocked.saveQuestionAndKey).toHaveBeenCalledWith(
        'quiz-blank-1',
        'board',
        expect.objectContaining({
          directed: true,
        }),
        null,
        expect.anything(),
      )
    })
  })

  it('saves blank canvas question without rubric when rubric is omitted', async () => {
    mocked.saveQuestionAndKey.mockClear()

    render(
      <MemoryRouter>
        <BlankCanvasBuilder quizId="quiz-blank-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText(/Activity instructions/i)).toBeInTheDocument()

    // Fill instructions, leave rubric blank
    fireEvent.change(screen.getByLabelText(/Activity instructions/i), {
      target: { value: 'Create your mind map.' },
    })

    // Save
    fireEvent.click(screen.getByRole('button', { name: /Save blank canvas/i }))

    await waitFor(() => {
      expect(mocked.saveQuestionAndKey).toHaveBeenCalledWith(
        'quiz-blank-1',
        'board',
        expect.not.objectContaining({
          rubric: expect.anything(),
        }),
        null,
        expect.anything(),
      )
    })
  })
})
