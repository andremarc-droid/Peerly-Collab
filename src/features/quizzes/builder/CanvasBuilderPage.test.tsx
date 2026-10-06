import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasBuilderPage from './CanvasBuilderPage'
import type { CanvasQuestion, CanvasAnswerKey } from '../../canvas/types'
import { quizModeLabel } from '../types'

// Mock ResizeObserver for React Flow
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

const mocks = vi.hoisted(() => ({
  getQuiz: vi.fn(),
  getQuestionWithKey: vi.fn(),
  saveQuestionAndKey: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1', displayName: 'Teacher' } }),
}))

vi.mock('../../../shared/ui/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('../services', () => ({
  getQuiz: mocks.getQuiz,
  getQuestionWithKey: mocks.getQuestionWithKey,
  saveQuestionAndKey: mocks.saveQuestionAndKey,
}))

describe('CanvasBuilderPage Component Tests', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getQuiz.mockResolvedValue({
      id: 'quiz-1',
      ownerId: 'teacher-1',
      title: 'Cell Biology Canvas',
      mode: 'canvas',
      settings: {
        participation: { type: 'individual' },
        answerReveal: 'never',
        scoreVisibility: 'immediate',
      },
    })
    mocks.getQuestionWithKey.mockResolvedValue(null)
    mocks.saveQuestionAndKey.mockResolvedValue('board')
  })

  function renderBuilder(initialUrl = '/instructor/quizzes/quiz-1?tab=questions') {
    return render(
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<CanvasBuilderPage />} />
          <Route path="/instructor/quizzes/:quizId/settings" element={<div>Settings Page</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('renders empty state when canvas has no cards and error state is not shown', async () => {
    renderBuilder()

    expect(await screen.findByRole('heading', { name: 'Start your canvas board' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add your first card/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds each card type (note, paragraph, image, link) via the toolbar', async () => {
    renderBuilder()

    // Add first card via empty state button
    const firstCardBtn = await screen.findByRole('button', { name: /Add your first card/i })
    fireEvent.click(firstCardBtn)

    // Board should now be visible with the toolbar
    expect(await screen.findByRole('toolbar', { name: 'Canvas authoring toolbar' })).toBeInTheDocument()

    // Add paragraph card
    fireEvent.click(screen.getByRole('button', { name: 'Add Paragraph card' }))
    // Add image card
    fireEvent.click(screen.getByRole('button', { name: 'Add Image card' }))
    // Add link card
    fireEvent.click(screen.getByRole('button', { name: 'Add Link card' }))

    // All 4 card types should now be present on the board
    expect(screen.getByRole('article', { name: /Note/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Section/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Image/i })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: /Link/i })).toBeInTheDocument()
  })

  it('edits and deletes a selected card in the side panel', async () => {
    renderBuilder()

    // Add a note card
    fireEvent.click(await screen.findByRole('button', { name: /Add your first card/i }))

    // The side panel should open for the newly added card
    expect(await screen.findByLabelText('Editor side panel')).toBeInTheDocument()

    // Edit title and content
    const titleInput = screen.getByLabelText('Title')
    fireEvent.change(titleInput, { target: { value: 'Mitochondria' } })

    const contentInput = screen.getByLabelText(/Content/i)
    fireEvent.change(contentInput, { target: { value: 'Powerhouse of the cell generating ATP.' } })

    // Verify board card updated
    const mitoCard = screen.getByRole('article', { name: /Mitochondria/i })
    expect(mitoCard).toBeInTheDocument()
    expect(mitoCard).toHaveTextContent('Powerhouse of the cell generating ATP.')

    // Delete the card
    const deleteBtn = screen.getByRole('button', { name: 'Delete card' })
    fireEvent.click(deleteBtn)

    // Should return to empty state
    expect(await screen.findByRole('heading', { name: 'Start your canvas board' })).toBeInTheDocument()
  })

  it('creates a connection via the keyboard connect dialog and deletes it', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect organelles to their functions',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Ribosome', content: 'Protein synthesis', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'paragraph', title: 'Endoplasmic Reticulum', content: 'Folding and transport', position: { x: 200, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: 'Ribosomes are bound to rough ER.',
      connections: [],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    renderBuilder()

    // Wait for board to render cards
    expect(await screen.findByRole('article', { name: /Ribosome/i })).toBeInTheDocument()

    // Open connect cards dialog
    const connectCardsBtn = screen.getByRole('button', { name: 'Connect cards dialog' })
    fireEvent.click(connectCardsBtn)

    expect(await screen.findByRole('dialog', { name: 'Connect cards' })).toBeInTheDocument()

    // Select source and target
    const fromSelect = screen.getByLabelText('From card')
    const toSelect = screen.getByLabelText('To card')
    fireEvent.change(fromSelect, { target: { value: 'c1' } })
    fireEvent.change(toSelect, { target: { value: 'c2' } })

    // Submit dialog
    const createConnBtn = screen.getByRole('button', { name: 'Create connection' })
    fireEvent.click(createConnBtn)

    // Connection counter should now be 1 of 80
    expect(screen.getByText('Connections used 1 of 80')).toBeInTheDocument()

    // Click the edge to select it in the side panel
    const boardContainer = screen.getByTestId('canvas-board')
    expect(boardContainer).toBeInTheDocument()
  })

  it('displays validation errors in plain language for invalid cards and limits', async () => {
    renderBuilder()

    // Add first card
    fireEvent.click(await screen.findByRole('button', { name: /Add your first card/i }))

    // Only 1 card and 0 connections: should show plain language requirements
    expect(await screen.findByText('Add at least 2 cards to form connections.')).toBeInTheDocument()

    // Add second card
    fireEvent.click(screen.getByRole('button', { name: 'Add Link card' }))

    // Now 2 cards but 0 connections: should require at least 1 connection
    expect(await screen.findByText('Create at least 1 connection for the answer key.')).toBeInTheDocument()

    // Link card needs URL: should show specific plain language error
    expect(screen.getByText(/requires an HTTPS link/i)).toBeInTheDocument()
  })

  it('shows unsaved changes status and guards leaving without saving', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect concepts',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Card 1', content: 'Text 1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Card 2', content: 'Text 2', position: { x: 100, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'c1->c2', from: 'c1', to: 'c2', points: 1 }],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    renderBuilder()

    // Should load as Saved
    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // Edit prompt
    fireEvent.click(screen.getByRole('button', { name: 'Board settings' }))
    const promptInput = await screen.findByLabelText('Activity prompt')
    fireEvent.change(promptInput, { target: { value: 'Updated activity prompt' } })

    // Status should now be Unsaved changes
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    // Click Settings navigation tab in workspace navigation
    const workspaceNav = screen.getByRole('navigation', { name: 'Quiz workspace' })
    const settingsTab = Array.from(workspaceNav.querySelectorAll('button')).find((b) => b.textContent?.includes('Settings'))
    expect(settingsTab).toBeDefined()
    fireEvent.click(settingsTab!)

    // Leave without saving confirmation dialog should appear
    expect(await screen.findByRole('dialog', { name: 'Leave with unsaved changes?' })).toBeInTheDocument()
    expect(screen.getByText('Discard and leave')).toBeInTheDocument()
  })

  it('guards in-app links with window.confirm and does not prompt twice for workspace buttons', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect concepts',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Card 1', content: 'Text 1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Card 2', content: 'Text 2', position: { x: 100, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'c1->c2', from: 'c1', to: 'c2', points: 1 }],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=questions']}>
        <div>
          <a href="/instructor/classes">Back to classes</a>
          <CanvasBuilderPage quizId="quiz-1" />
        </div>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // Make dirty by editing prompt
    fireEvent.click(screen.getByRole('button', { name: 'Board settings' }))
    const promptInput = await screen.findByLabelText('Activity prompt')
    fireEvent.change(promptInput, { target: { value: 'Changed prompt' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    // 1. In-app anchor click should trigger window.confirm
    const inAppLink = screen.getByText('Back to classes')
    const linkClickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    inAppLink.dispatchEvent(linkClickEvent)
    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?')
    expect(linkClickEvent.defaultPrevented).toBe(true)

    confirmSpy.mockClear()

    // 2. Workspace button click should open in-page ConfirmDialog, NOT window.confirm
    const workspaceNav = screen.getByRole('navigation', { name: 'Quiz workspace' })
    const settingsTab = Array.from(workspaceNav.querySelectorAll('button')).find((b) => b.textContent?.includes('Settings'))
    fireEvent.click(settingsTab!)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Leave with unsaved changes?' })).toBeInTheDocument()
  })

  it('verifies mode labels everywhere', () => {
    expect(quizModeLabel('quiz')).toBe('Quiz')
    expect(quizModeLabel('flashcards')).toBe('Flashcards')
    expect(quizModeLabel('canvas')).toBe('Canvas')
    expect(quizModeLabel('unknown')).toBe('Quiz')
  })

  it('saves canvas atomically via saveQuestionAndKey', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Original prompt',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Card 1', content: 'Text 1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Card 2', content: 'Text 2', position: { x: 100, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: 'Explanation',
      connections: [{ id: 'c1->c2', from: 'c1', to: 'c2', points: 1 }],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    renderBuilder()

    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // Save board button
    const saveBtn = screen.getByRole('button', { name: 'Save board' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mocks.saveQuestionAndKey).toHaveBeenCalledWith(
        'quiz-1',
        'board',
        expect.objectContaining({
          type: 'canvas',
          prompt: 'Original prompt',
          cards: expect.arrayContaining([expect.objectContaining({ id: 'c1' })]),
        }),
        expect.objectContaining({
          type: 'canvas',
          connections: expect.arrayContaining([expect.objectContaining({ from: 'c1', to: 'c2' })]),
        }),
      )
    })
  })

  it('prompts for confirmation when switching directed to undirected with connections, collapses reciprocal pairs, and reports count', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect concepts',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Card 1', content: 'Text 1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Card 2', content: 'Text 2', position: { x: 100, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: '',
      connections: [
        { id: 'c1->c2', from: 'c1', to: 'c2', points: 2 },
        { id: 'c2->c1', from: 'c2', to: 'c1', points: 6 },
      ],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    renderBuilder()

    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // Open Board settings
    fireEvent.click(screen.getByRole('button', { name: 'Board settings' }))

    // Directed connections checkbox should be checked
    const directedCheckbox = await screen.findByRole('checkbox', { name: /Directed connections/i })
    expect(directedCheckbox).toBeChecked()

    // Uncheck directed checkbox
    fireEvent.click(directedCheckbox)

    // Confirmation dialog should appear
    expect(await screen.findByRole('dialog', { name: 'Switch to undirected connections?' })).toBeInTheDocument()

    // Confirm switch
    const confirmBtn = screen.getByRole('button', { name: 'Switch to undirected' })
    fireEvent.click(confirmBtn)

    // Directed checkbox should now be unchecked
    expect(directedCheckbox).not.toBeChecked()

    // Toast should inform about merged reciprocal connection
    expect(mocks.showToast).toHaveBeenCalledWith(
      'info',
      '1 reciprocal connection was merged into undirected connection.',
    )

    // Connection counter should show 1 of 80 (collapsed from 2)
    expect(screen.getByText('Connections used 1 of 80')).toBeInTheDocument()
  })

  it('prompts for confirmation when switching undirected to directed with connections, and re-normalizes connection IDs', async () => {
    const existingQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect concepts',
      points: 100,
      layoutMode: 'scattered',
      directed: false,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Card 1', content: 'Text 1', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Card 2', content: 'Text 2', position: { x: 100, y: 0 } },
      ],
    }
    const existingKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: '',
      connections: [{ id: 'c1<->c2', from: 'c1', to: 'c2', points: 3 }],
    }

    mocks.getQuestionWithKey.mockResolvedValueOnce({
      id: 'board',
      question: existingQuestion,
      answerKey: existingKey,
    })

    renderBuilder()

    expect(await screen.findByText('Saved')).toBeInTheDocument()

    // Open Board settings
    fireEvent.click(screen.getByRole('button', { name: 'Board settings' }))

    // Directed checkbox is initially unchecked
    const directedCheckbox = await screen.findByRole('checkbox', { name: /Directed connections/i })
    expect(directedCheckbox).not.toBeChecked()

    // Check directed checkbox
    fireEvent.click(directedCheckbox)

    // Confirmation dialog should appear
    expect(await screen.findByRole('dialog', { name: 'Switch to directed connections?' })).toBeInTheDocument()

    // Confirm switch
    const confirmBtn = screen.getByRole('button', { name: 'Switch to directed' })
    fireEvent.click(confirmBtn)

    // Directed checkbox should now be checked
    expect(directedCheckbox).toBeChecked()

    expect(mocks.showToast).toHaveBeenCalledWith('success', 'Switched to directed connections.')
  })
})
