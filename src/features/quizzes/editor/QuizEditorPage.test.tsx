import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { QuizEditorPage } from './QuizEditorPage'
import { defaultQuizSettings } from '../schemas/settings'

const mocks = vi.hoisted(() => ({ classes: [] as Array<{ id: string; name: string; status: string }>, questionCount: 0, createQuiz: vi.fn(), getQuiz: vi.fn(), updateQuiz: vi.fn(), saveQuestionAndKey: vi.fn(), watchQuestionPairs: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', displayName: 'Teacher' } }) }))
vi.mock('../../profile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Teacher' } }) }))
vi.mock('../services', () => ({ createQuiz: mocks.createQuiz, getQuiz: mocks.getQuiz, updateQuiz: mocks.updateQuiz, saveQuestionAndKey: mocks.saveQuestionAndKey, watchQuestionPairs: mocks.watchQuestionPairs }))
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
  mocks.saveQuestionAndKey.mockReset().mockResolvedValue('question-1')
  mocks.watchQuestionPairs.mockReset().mockImplementation((_id: string, onChange: (items: never[]) => void) => { onChange([]); return vi.fn() })
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
    fireEvent.click(screen.getByRole('button', { name: 'Create and continue' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.not.objectContaining({ mode: expect.anything() }))
    expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', expect.objectContaining({ title: 'Updated Title' }))
  })
})

