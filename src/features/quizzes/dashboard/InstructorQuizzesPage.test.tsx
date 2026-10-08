import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { defaultQuizSettings } from '../schemas/settings'
import type { QuizRecord } from '../services/quizService'
import { InstructorQuizzesPage } from './InstructorQuizzesPage'

const mocks = vi.hoisted(() => ({
  classes: [] as Array<{ id: string; name: string; status: string }>,
  quizzes: [] as QuizRecord[],
  publishQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'teacher', displayName: 'Teacher' } }) }))
vi.mock('../../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('../../classes/services/classService', () => ({
  watchMyClasses: (_uid: string, onChange: (items: never[]) => void) => { onChange(mocks.classes as never[]); return vi.fn() },
}))
vi.mock('../services', () => ({
  archiveQuiz: vi.fn(),
  duplicateQuiz: vi.fn(),
  publishQuiz: mocks.publishQuiz,
  restoreQuiz: vi.fn(),
  unpublishQuiz: vi.fn(),
  updateQuiz: mocks.updateQuiz,
  watchOwnerQuizzes: (_uid: string, onChange: (items: QuizRecord[]) => void) => { onChange(mocks.quizzes); return vi.fn() },
}))
vi.mock('../services/deleteQuizCascade', () => ({ countQuizAttempts: vi.fn(), deleteQuizCascade: vi.fn() }))

const quiz: QuizRecord = {
  id: 'quiz-1',
  ownerId: 'teacher',
  ownerName: 'Teacher',
  classId: null,
  title: 'Legacy biology quiz',
  description: '',
  tags: [],
  mode: 'quiz',
  status: 'draft',
  questionCount: 2,
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(2),
  publishedAt: null,
  settings: defaultQuizSettings('quiz'),
}

function renderPage() {
  return render(<MemoryRouter><InstructorQuizzesPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.classes = [{ id: 'class-1', name: 'Biology', status: 'active' }]
  mocks.quizzes = [quiz]
  mocks.publishQuiz.mockResolvedValue(undefined)
  mocks.updateQuiz.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('InstructorQuizzesPage publishing', () => {
  it('assigns an unassigned legacy draft to a chosen active class before publishing', async () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByRole('dialog', { name: 'Assign and publish quiz' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^Active class/ })).toHaveValue('class-1')

    fireEvent.click(screen.getByRole('button', { name: 'Assign & publish' }))

    await waitFor(() => {
      expect(mocks.updateQuiz).toHaveBeenCalledWith('quiz-1', { classId: 'class-1' })
      expect(mocks.publishQuiz).toHaveBeenCalledWith('quiz-1')
    })
    expect(mocks.updateQuiz.mock.invocationCallOrder[0]).toBeLessThan(mocks.publishQuiz.mock.invocationCallOrder[0])
  })

  it('does not offer assignment when there are no active classes', () => {
    mocks.classes = [{ id: 'class-1', name: 'Archived biology', status: 'archived' }]
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    expect(screen.queryByRole('dialog', { name: 'Assign and publish quiz' })).not.toBeInTheDocument()
    expect(mocks.showToast).toHaveBeenCalledWith('error', 'Create an active class before publishing this quiz.')
    expect(mocks.updateQuiz).not.toHaveBeenCalled()
    expect(mocks.publishQuiz).not.toHaveBeenCalled()
  })
})
