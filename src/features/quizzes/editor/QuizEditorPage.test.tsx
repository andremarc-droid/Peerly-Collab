import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { QuizEditorPage } from './QuizEditorPage'
import { QuestionBuilderPage } from '../builder/QuestionBuilderPage'
import { defaultQuizSettings } from '../schemas/settings'

const mocks = vi.hoisted(() => ({
  classes: [] as Array<{ id: string; name: string; status: string }>, questionCount: 0,
  createQuiz: vi.fn(), getQuiz: vi.fn(), updateQuiz: vi.fn(), saveQuestionAndKey: vi.fn(), watchQuestionPairs: vi.fn(),
}))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', displayName: 'Teacher' } }) }))
vi.mock('../../profile/useUserProfile', () => ({ useUserProfile: () => ({ profile: { name: 'Teacher' } }) }))
vi.mock('../services', () => ({
  createQuiz: mocks.createQuiz, getQuiz: mocks.getQuiz, updateQuiz: mocks.updateQuiz,
  saveQuestionAndKey: mocks.saveQuestionAndKey, watchQuestionPairs: mocks.watchQuestionPairs,
}))
vi.mock('../../classes/services/classService', () => ({ watchMyClasses: (_uid: string, onChange: (items: never[]) => void) => { onChange(mocks.classes as never[]); return () => undefined } }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

afterEach(cleanup)

const classOption = { id: 'class-1', name: 'Science', status: 'active' }
const savedQuiz = {
  id: 'quiz-1', ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-1', title: 'Practice', description: '', tags: [],
  mode: 'quiz' as const, status: 'draft' as const, questionCount: 0, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1),
  publishedAt: null, settings: defaultQuizSettings('quiz'),
}

beforeEach(() => {
  mocks.classes = [classOption]
  mocks.questionCount = 0
  mocks.createQuiz.mockReset().mockResolvedValue('new-quiz')
  mocks.getQuiz.mockReset().mockImplementation(async (quizId: string) => ({ ...savedQuiz, id: quizId, questionCount: mocks.questionCount }))
  mocks.updateQuiz.mockReset().mockResolvedValue(undefined)
  mocks.saveQuestionAndKey.mockReset().mockImplementation(async () => { mocks.questionCount = 1; return 'question-1' })
  mocks.watchQuestionPairs.mockReset().mockImplementation((_quizId: string, onChange: (items: never[]) => void) => { onChange([]); return vi.fn() })
})

describe('quiz editor and deletion confirmation', () => {
  it('requires a title and keeps group participation visibly disabled', async () => {
    render(<MemoryRouter><QuizEditorPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Save and add questions' }))
    expect(await screen.findByText('Enter a quiz title.')).toBeTruthy()
    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add questions' })).toBeDisabled()
    expect(screen.getByText('Save your settings first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save and add questions' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled()
  })

  it('shows enabled question navigation on saved quizzes, with an edit label when questions exist', async () => {
    const first = render(<MemoryRouter initialEntries={['/instructor/quizzes/quiz-1']}><Routes><Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} /></Routes></MemoryRouter>)
    const add = await screen.findByRole('link', { name: 'Add questions' })
    expect(add).toHaveAttribute('href', '/instructor/quizzes/quiz-1/questions')
    expect(add).toBeEnabled()
    first.unmount()
    mocks.getQuiz.mockResolvedValue({ ...savedQuiz, questionCount: 2 })
    render(<MemoryRouter initialEntries={['/instructor/quizzes/quiz-1']}><Routes><Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'Edit questions' })).toHaveAttribute('href', '/instructor/quizzes/quiz-1/questions')
    expect(screen.getByText('2 questions added')).toBeInTheDocument()
  })

  it('saves a class quiz and navigates directly to its builder, then returns to settings', async () => {
    render(<MemoryRouter initialEntries={['/instructor/quizzes/new?classId=class-1']}><Routes>
      <Route path="/instructor/quizzes/new" element={<QuizEditorPage />} />
      <Route path="/instructor/quizzes/:quizId/questions" element={<QuestionBuilderPage />} />
      <Route path="/instructor/quizzes/:quizId" element={<QuizEditorPage />} />
    </Routes></MemoryRouter>)
    fireEvent.change(await screen.findByLabelText('Quiz title'), { target: { value: 'Science review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and add questions' }))
    expect(await screen.findByRole('heading', { name: 'Shape the practice.' })).toBeInTheDocument()
    expect(mocks.createQuiz).toHaveBeenCalledWith('teacher', 'Teacher', expect.objectContaining({ classId: 'class-1', title: 'Science review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add identification' }))
    fireEvent.change(document.querySelector('#question-prompt')!, { target: { value: 'What is 2 + 2?' } })
    fireEvent.change(document.querySelector('#accepted-answers')!, { target: { value: '4' } })
    await waitFor(() => expect(mocks.saveQuestionAndKey).toHaveBeenCalledWith('new-quiz', null, expect.objectContaining({ type: 'identification', prompt: 'What is 2 + 2?' }), expect.objectContaining({ type: 'identification', acceptedAnswers: ['4'] })))
    fireEvent.click(screen.getByRole('link', { name: 'Quiz settings' }))
    expect(await screen.findByRole('heading', { name: 'Quiz settings.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit questions' })).toHaveAttribute('href', '/instructor/quizzes/new-quiz/questions')
  })

  it('requires the quiz title before confirming a destructive delete', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog open onClose={vi.fn()} onConfirm={onConfirm} title="Delete quiz?" description="Submissions will be erased." requiredName="Algebra practice" confirmLabel="Delete quiz" />)
    const confirm = screen.getByRole('button', { name: 'Delete quiz' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Type Algebra practice to confirm'), { target: { value: 'Algebra' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Type Algebra practice to confirm'), { target: { value: 'Algebra practice' } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
