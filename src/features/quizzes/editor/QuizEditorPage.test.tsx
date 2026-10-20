import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { QuizEditorPage } from './QuizEditorPage'
import { defaultQuizSettings } from '../schemas/settings'

const mocks = vi.hoisted(() => ({
  classes: [] as Array<{ id: string; name: string; status: string }>,
  questionCount: 0,
  createQuiz: vi.fn(),
  getQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  unpublishQuiz: vi.fn(),
  saveQuestionAndKey: vi.fn(),
  watchQuestionPairs: vi.fn(),
  getQuestionWithKey: vi.fn(),
  duplicateQuiz: vi.fn(),
  hasQuizAttemptsOrParticipants: vi.fn(),
}))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', displayName: 'Teacher' } }) }))
vi.mock('../../profile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Teacher' } }) }))
vi.mock('../services', () => ({
  createQuiz: mocks.createQuiz,
  getQuiz: mocks.getQuiz,
  updateQuiz: mocks.updateQuiz,
  unpublishQuiz: mocks.unpublishQuiz,
  saveQuestionAndKey: mocks.saveQuestionAndKey,
  watchQuestionPairs: mocks.watchQuestionPairs,
  getQuestionWithKey: mocks.getQuestionWithKey,
  duplicateQuiz: mocks.duplicateQuiz,
  hasQuizAttemptsOrParticipants: mocks.hasQuizAttemptsOrParticipants,
}))
vi.mock('../services/quizService', () => ({
  createQuiz: mocks.createQuiz,
  getQuiz: mocks.getQuiz,
  updateQuiz: mocks.updateQuiz,
  duplicateQuiz: mocks.duplicateQuiz,
  hasQuizAttemptsOrParticipants: mocks.hasQuizAttemptsOrParticipants,
  deleteQuizCascade: vi.fn(),
  publishQuiz: vi.fn(),
  unpublishQuiz: mocks.unpublishQuiz,
  archiveQuiz: vi.fn(),
}))
vi.mock('../services/questionService', () => ({
  saveQuestionAndKey: mocks.saveQuestionAndKey,
  watchQuestionPairs: mocks.watchQuestionPairs,
  getQuestionWithKey: mocks.getQuestionWithKey,
  listQuestions: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../canvas/imageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../canvas/imageService')>()
  return {
    ...actual,
    listImages: vi.fn().mockResolvedValue([]),
    reconcileImages: vi.fn().mockResolvedValue(undefined),
    saveImage: vi.fn(),
  }
})
vi.mock('../../classes/services/classService', () => ({ watchMyClasses: (_uid: string, onChange: (items: never[]) => void) => { onChange(mocks.classes as never[]); return () => undefined } }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
afterEach(cleanup)
const savedQuiz = { id: 'quiz-1', ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-1', title: 'Practice', description: '', tags: [], mode: 'quiz' as const, status: 'draft' as const, questionCount: 0, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: null, settings: defaultQuizSettings('quiz') }
beforeEach(() => {
  mocks.classes = [{ id: 'class-1', name: 'Science', status: 'active' }]
  mocks.questionCount = 0
  mocks.createQuiz.mockReset().mockResolvedValue('new-quiz')
  mocks.getQuiz.mockReset().mockImplementation(async (id: string) => ({ ...savedQuiz, id }))
  mocks.updateQuiz.mockReset().mockResolvedValue(undefined)
  mocks.unpublishQuiz.mockReset().mockResolvedValue(undefined)
  mocks.saveQuestionAndKey.mockReset().mockResolvedValue('question-1')
  mocks.watchQuestionPairs.mockReset().mockImplementation((_id: string, onChange: (items: never[]) => void) => { onChange([]); return vi.fn() })
  mocks.getQuestionWithKey.mockReset().mockResolvedValue(null)
  mocks.duplicateQuiz.mockReset().mockResolvedValue('quiz-copy')
  mocks.hasQuizAttemptsOrParticipants.mockReset().mockResolvedValue(false)
})

describe('quick create and quiz deletion confirmation', () => {
  it('keeps quick create to title, type, and class without save settings', async () => {
    render(<MemoryRouter initialEntries={['/instructor/quizzes/new']}><QuizEditorPage /></MemoryRouter>)
    expect(await screen.findByRole('dialog', { name: 'Create quiz' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByLabelText('Class')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
  })
  it('creates the draft and routes into the Questions workspace', async () => {
    render(<MemoryRouter initialEntries={['/instructor/quizzes/new?classId=class-1']}><Routes><Route path="/instructor/quizzes/new" element={<QuizEditorPage />} /><Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} /></Routes></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Science review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create quiz' }))
    expect(await screen.findByRole('navigation', { name: 'Quiz workspace' })).toBeInTheDocument()
    expect(mocks.createQuiz).toHaveBeenCalledWith('teacher', 'Teacher', expect.objectContaining({ classId: 'class-1', title: 'Science review' }))
  })
  it('keeps the shared consequential confirmation behavior', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open onClose={vi.fn()} onConfirm={onConfirm} title="Delete quiz?" description="Submissions will be erased." requiredName="Algebra practice" confirmLabel="Delete quiz" />)
    expect(screen.getByRole('button', { name: 'Delete quiz' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Algebra practice to confirm'), { target: { value: 'Algebra practice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete quiz' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('renders mode as a read-only label on existing quiz and omits mode on update', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Type: Quiz, cannot be changed after creation')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: /format/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /practice quiz/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /flashcard deck/i })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'Updated Title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.not.objectContaining({ mode: expect.anything() }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.objectContaining({ title: 'Updated Title' }))
  })

  it('allows editing settings for an unassigned quiz without trying to reassign it', async () => {
    mocks.getQuiz.mockResolvedValueOnce({ ...savedQuiz, classId: null })
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Practice')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'Edited without assignment' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.objectContaining({ title: 'Edited without assignment' }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.not.objectContaining({ classId: expect.anything() }))
  })

  it('allows selecting Canvas type in QuickCreateQuiz with one-line description and creates canvas draft', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/new?classId=class-1']}>
        <Routes>
          <Route path="/instructor/quizzes/new" element={<QuizEditorPage />} />
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('dialog', { name: 'Create quiz' })).toBeInTheDocument()
    expect(screen.getByText('Visual board where students connect related concept cards.')).toBeInTheDocument()

    const canvasOption = screen.getByRole('button', { name: /Canvas/i })
    fireEvent.click(canvasOption)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Cell Structure Canvas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create canvas' }))

    expect(mocks.createQuiz).toHaveBeenCalledWith(
      'teacher',
      'Teacher',
      expect.objectContaining({
        classId: 'class-1',
        title: 'Cell Structure Canvas',
        mode: 'canvas',
      }),
    )
  })

  it('renders CanvasBuilderPage when quiz mode is canvas and tab is questions', async () => {
    mocks.getQuiz.mockImplementation(async (id: string) => ({
      ...savedQuiz,
      id,
      mode: id === 'quiz-canvas' ? 'canvas' : 'quiz',
      title: id === 'quiz-canvas' ? 'Neural Networks' : 'Practice',
    }))

    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-canvas?tab=questions']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('STEP 1 OF 3 · CANVAS BOARD', {}, { timeout: 4000 })).toBeInTheDocument()
    const workspaceNav = await screen.findByRole('navigation', { name: 'Quiz workspace' })
    expect(workspaceNav).toBeInTheDocument()
    expect(workspaceNav).toHaveTextContent('Questions')
    expect(workspaceNav).toHaveTextContent('Settings')
    expect(workspaceNav).toHaveTextContent('Preview & publish')
    expect(workspaceNav).toHaveTextContent('Next: Settings')
  })

  it('guards in-app links when quiz settings are dirty', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=settings']}>
        <div>
          <a href="/instructor">Back to home</a>
          <Routes>
            <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
          </Routes>
        </div>
      </MemoryRouter>,
    )

    expect(await screen.findByDisplayValue('Practice')).toBeInTheDocument()

    // Edit title to make dirty
    fireEvent.change(screen.getByLabelText('Quiz title'), { target: { value: 'New title' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    // Click in-app link
    const link = screen.getByText('Back to home')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)

    expect(confirmSpy).toHaveBeenCalledWith('You have unsaved changes. Leave without saving?')
    expect(event.defaultPrevented).toBe(true)
  })

  it('automatically unpublishes a published quiz on load and allows editing settings', async () => {
    mocks.getQuiz.mockImplementation(async (id: string) => ({
      ...savedQuiz,
      id,
      status: 'published',
      publishedAt: Timestamp.fromMillis(2),
    }))

    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-pub?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Shuffle questions')).toBeInTheDocument()
    expect(mocks.unpublishQuiz).toHaveBeenCalledWith('quiz-pub')

    // Shuffle checkboxes are enabled
    const shuffleQ = screen.getByLabelText('Shuffle questions') as HTMLInputElement
    const shuffleO = screen.getByLabelText('Shuffle answer options') as HTMLInputElement
    expect(shuffleQ).not.toBeDisabled()
    expect(shuffleO).not.toBeDisabled()
  })

  it('allows editing settings on a draft quiz', async () => {
    mocks.getQuiz.mockResolvedValueOnce({
      ...savedQuiz,
      id: 'quiz-draft',
      status: 'draft',
    })

    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-draft?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Shuffle questions')).toBeInTheDocument()
    expect(screen.getByLabelText('Shuffle questions')).not.toBeDisabled()
  })

  it('opens the Preview & publish step for the old ?tab=preview link', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=preview']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('PREVIEW & PUBLISH')).toBeInTheDocument()
  })

  it('blocks publishing and lists what is missing when the quiz has no questions', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=publish']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Add at least one question.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish quiz' })).toBeDisabled()
  })

  it('supports selecting custom attempts and entering a custom number', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const attemptsSelect = await screen.findByLabelText('Attempts allowed') as HTMLSelectElement
    expect(attemptsSelect).toBeInTheDocument()

    // Initially custom attempts input is not visible
    expect(screen.queryByLabelText(/Number of attempts/)).not.toBeInTheDocument()

    // Select Custom
    await user.selectOptions(attemptsSelect, 'custom')

    // Now custom number input appears
    const customInput = await screen.findByLabelText(/Number of attempts/)
    expect(customInput).toBeInTheDocument()
    expect(customInput).toHaveValue(4)

    // Erase the input completely
    await user.clear(customInput)
    expect(customInput).toHaveValue(null)

    // Type a custom number, e.g. 7
    await user.type(customInput, '7')
    expect(customInput).toHaveValue(7)

    // Save quiz
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith(
      'quiz-1',
      expect.objectContaining({
        settings: expect.objectContaining({ attemptsAllowed: 7 }),
      }),
    )
  })

  it('allows erasing seconds input completely without automatically reinserting zero', async () => {
    render(
      <MemoryRouter initialEntries={['/instructor/quizzes/quiz-1?tab=settings']}>
        <Routes>
          <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const checkbox = await screen.findByLabelText(/Set a time limit for each question/)
    fireEvent.click(checkbox)

    const secondsInput = await screen.findByLabelText('Seconds')
    expect(secondsInput).toHaveValue(0)

    // Erase seconds to empty string
    fireEvent.change(secondsInput, { target: { value: '' } })
    expect(secondsInput).toHaveValue(null)

    // Type 45 seconds
    fireEvent.change(secondsInput, { target: { value: '45' } })
    expect(secondsInput).toHaveValue(45)
  })
})

