import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { defaultQuizSettings } from '../schemas/settings'
import type { QuizRecord } from '../services/quizService'
import { InstructorQuizzesPage } from './InstructorQuizzesPage'

const mocks = vi.hoisted(() => ({
  classes: [] as Array<{ id: string; name: string; status: string }>,
  quizzes: [] as QuizRecord[],
  unpublishQuiz: vi.fn(),
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
  restoreQuiz: vi.fn(),
  unpublishQuiz: mocks.unpublishQuiz,
  watchOwnerQuizzes: (_uid: string, onChange: (items: QuizRecord[]) => void) => { onChange(mocks.quizzes); return vi.fn() },
}))
vi.mock('../services/deleteQuizCascade', () => ({ countQuizAttempts: vi.fn(), deleteQuizCascade: vi.fn() }))

const draftQuiz: QuizRecord = {
  id: 'quiz-1',
  ownerId: 'teacher',
  ownerName: 'Teacher',
  classId: 'class-1',
  title: 'Biology quiz',
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
  mocks.quizzes = [draftQuiz]
  mocks.unpublishQuiz.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('InstructorQuizzesPage cards', () => {
  it('shows one primary button on a draft and no stray Publish button', () => {
    renderPage()

    expect(screen.getByRole('link', { name: /Continue editing/ })).toHaveAttribute('href', '/instructor/quizzes/quiz-1')
    expect(screen.queryByRole('button', { name: /^Publish/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Duplicate/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Biology quiz' })).toBeInTheDocument()
  })

  it('sends a draft to the Preview & publish step from the menu instead of publishing it blind', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Biology quiz' }))

    expect(screen.getByRole('menuitem', { name: /Preview and publish/ })).toHaveAttribute('href', '/instructor/quizzes/quiz-1?tab=publish')
  })

  it('leads with View results on a published quiz and keeps Edit and Unpublish in the menu', () => {
    mocks.quizzes = [{ ...draftQuiz, status: 'published', publishedAt: Timestamp.fromMillis(3) }]
    renderPage()

    expect(screen.getByRole('link', { name: /View results/ })).toHaveAttribute('href', '/instructor/quizzes/quiz-1/results')
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Biology quiz' }))

    expect(screen.getByRole('menuitem', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Unpublish/ })).toBeInTheDocument()
  })
})
