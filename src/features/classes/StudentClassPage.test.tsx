import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { StudentClassPage } from './StudentClassPage'
import type { ClassWithId, EnrollmentWithId } from './types'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { QuizRecord } from '../quizzes/services/quizService'
import type { ModuleWithId } from '../modules/types'

const mocks = vi.hoisted(() => ({
  user: { uid: 'student-1', displayName: 'Sam' }, showToast: vi.fn(), leaveClass: vi.fn(async () => undefined),
  listEnrollments: vi.fn(), watchClass: vi.fn(), watchQuizzes: vi.fn(), subscribeToModules: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: mocks.user, status: 'signedIn' }) }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./services/joinService', () => ({
  listMyEnrollments: mocks.listEnrollments, leaveClass: mocks.leaveClass, getClassCodePreview: vi.fn(),
}))
vi.mock('./services/classService', () => ({ watchClass: mocks.watchClass }))
vi.mock('./services/quizService', () => ({ watchPublishedQuizzesForClass: mocks.watchQuizzes }))
vi.mock('../modules/services', () => ({ subscribeToModules: mocks.subscribeToModules }))
vi.mock('../quizzes/services/attemptService', () => ({ listUserAttempts: vi.fn(async () => []) }))

const now = Timestamp.fromMillis(1_700_000_000_000)
const classroom: ClassWithId = {
  id: 'class-1', ownerId: 'teacher', ownerName: 'Morgan', name: 'Biology', section: 'B', subject: 'Science', description: '',
  joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
}
const enrollment: EnrollmentWithId = {
  id: 'class-1_student-1', classId: 'class-1', ownerId: 'teacher', uid: 'student-1', studentName: 'Sam', studentPhotoURL: null,
  className: 'Biology', status: 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now,
}
const quiz: QuizRecord = { id: 'quiz-1', ownerId: 'teacher', ownerName: 'Morgan', classId: 'class-1', title: 'Cell basics', description: '', tags: [], mode: 'quiz', status: 'published', questionCount: 2, createdAt: now, updatedAt: now, publishedAt: now, settings: defaultQuizSettings('quiz') }

const moduleA: ModuleWithId = {
  id: 'mod-1', classId: 'class-1', ownerId: 'teacher', title: 'Unit 1: Cells', description: 'Overview of plant and animal cells',
  order: 0, status: 'published', quizIds: ['quiz-1'], resourceCount: 3, createdAt: now, updatedAt: now, publishedAt: now,
}
const moduleB: ModuleWithId = {
  id: 'mod-2', classId: 'class-1', ownerId: 'teacher', title: 'Unit 2: Genetics', description: 'Mendelian genetics notes',
  order: 1, status: 'published', quizIds: [], resourceCount: 1, createdAt: now, updatedAt: now, publishedAt: now,
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/student/classes/class-1']}><Routes>
    <Route path="/student/classes/:classId" element={<StudentClassPage />} />
    <Route path="/student/classes/:classId/modules/:moduleId" element={<h1>Module workspace</h1>} />
    <Route path="/student/quizzes/:quizId" element={<h1>Quiz introduction</h1>} />
    <Route path="/student" element={<h1>My classes</h1>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  mocks.showToast.mockClear()
  mocks.leaveClass.mockClear()
  mocks.listEnrollments.mockImplementation((_uid: string, onChange: (items: EnrollmentWithId[]) => void) => { onChange([enrollment]); return () => undefined })
  mocks.watchClass.mockImplementation((_id: string, onChange: (value: ClassWithId) => void) => { onChange(classroom); return () => undefined })
  mocks.watchQuizzes.mockImplementation((_id: string, onChange: (items: QuizRecord[]) => void) => { onChange([]); return () => undefined })
  mocks.subscribeToModules.mockImplementation((_id: string, _role: string, onChange: (items: ModuleWithId[]) => void) => { onChange([]); return () => undefined })
})
afterEach(cleanup)

describe('student class page', () => {
  it('asks before leaving and explains that past attempts stay with the instructor', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave class' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/keeps your past quiz attempts/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave class' }))
    expect(await screen.findByRole('heading', { name: 'My classes' })).toBeInTheDocument()
    expect(mocks.leaveClass).toHaveBeenCalledWith('class-1', 'student-1')
    expect(mocks.showToast).toHaveBeenCalledWith('success', expect.stringContaining('past attempts'))
  })

  it('returns to My classes with a toast if membership disappears', async () => {
    const subscription: { change?: (items: EnrollmentWithId[]) => void } = {}
    mocks.listEnrollments.mockImplementation((_uid: string, onChange: (items: EnrollmentWithId[]) => void) => { subscription.change = onChange; onChange([enrollment]); return () => undefined })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    subscription.change?.([])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My classes' })).toBeInTheDocument())
    expect(mocks.showToast).toHaveBeenCalledWith('info', 'You no longer have access to this class.')
  })

  it('starts an individual quiz from the class page', async () => {
    mocks.watchQuizzes.mockImplementation((_id: string, onChange: (items: QuizRecord[]) => void) => { onChange([quiz]); return () => undefined })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Cell basics' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute('href', '/student')
    const start = screen.getByRole('link', { name: 'Start' })
    expect(start).toBeEnabled()
    fireEvent.click(start)
    expect(await screen.findByRole('heading', { name: 'Quiz introduction' })).toBeInTheDocument()
  })

  it('renders published modules in order with title, description, resource count, attached quiz count and opens module', async () => {
    mocks.subscribeToModules.mockImplementation((_id: string, _role: string, onChange: (items: ModuleWithId[]) => void) => {
      onChange([moduleA, moduleB])
      return () => undefined
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unit 1: Cells' })).toBeInTheDocument()
    expect(screen.getByText('Overview of plant and animal cells')).toBeInTheDocument()
    expect(screen.getByText('3 resources · 1 attached quiz')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Unit 2: Genetics' })).toBeInTheDocument()
    expect(screen.getByText('Mendelian genetics notes')).toBeInTheDocument()
    expect(screen.getByText('1 resource · 0 attached quizzes')).toBeInTheDocument()

    const openLinks = screen.getAllByRole('link', { name: 'Open module' })
    expect(openLinks[0]).toHaveAttribute('href', '/student/classes/class-1/modules/mod-1')
    fireEvent.click(openLinks[0])
    expect(await screen.findByRole('heading', { name: 'Module workspace' })).toBeInTheDocument()
  })

  it('loads modules independently so module error shows ONLY error alert with Retry without hiding quizzes', async () => {
    mocks.watchQuizzes.mockImplementation((_id: string, onChange: (items: QuizRecord[]) => void) => {
      onChange([quiz])
      return () => undefined
    })
    mocks.subscribeToModules.mockImplementation((_id: string, _role: string, _onC: unknown, onError: (err: Error) => void) => {
      onError(new Error('Failed to load modules'))
      return () => undefined
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Modules unavailable')).toBeInTheDocument()
    expect(screen.getByText('Failed to load modules')).toBeInTheDocument()
    expect(screen.queryByText('No modules yet')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cell basics' })).toBeInTheDocument()
  })

  it('loads quizzes independently so quiz error shows ONLY error alert with Retry without hiding modules', async () => {
    mocks.subscribeToModules.mockImplementation((_id: string, _role: string, onChange: (items: ModuleWithId[]) => void) => {
      onChange([moduleA])
      return () => undefined
    })
    mocks.watchQuizzes.mockImplementation((_id: string, _onC: unknown, onError: (err: Error) => void) => {
      onError(new Error('Failed to load quizzes'))
      return () => undefined
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Quizzes unavailable')).toBeInTheDocument()
    expect(screen.getByText('Failed to load quizzes')).toBeInTheDocument()
    expect(screen.queryByText('No published quizzes yet')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Unit 1: Cells' })).toBeInTheDocument()
  })

  it('shows empty state for modules only after successful empty result', async () => {
    mocks.subscribeToModules.mockImplementation((_id: string, _role: string, onChange: (items: ModuleWithId[]) => void) => {
      onChange([])
      return () => undefined
    })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Biology.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No modules yet' })).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'Modules unavailable' })).not.toBeInTheDocument()
  })
})
