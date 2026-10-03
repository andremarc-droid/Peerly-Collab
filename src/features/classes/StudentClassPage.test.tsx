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

const mocks = vi.hoisted(() => ({
  user: { uid: 'student-1', displayName: 'Sam' }, showToast: vi.fn(), leaveClass: vi.fn(async () => undefined),
  listEnrollments: vi.fn(), watchClass: vi.fn(), watchQuizzes: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: mocks.user, status: 'signedIn' }) }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./services/joinService', () => ({
  listMyEnrollments: mocks.listEnrollments, leaveClass: mocks.leaveClass, getClassCodePreview: vi.fn(),
}))
vi.mock('./services/classService', () => ({ watchClass: mocks.watchClass }))
vi.mock('./services/quizService', () => ({ watchPublishedQuizzesForClass: mocks.watchQuizzes }))

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

function renderPage() {
  return render(<MemoryRouter initialEntries={['/student/classes/class-1']}><Routes>
    <Route path="/student/classes/:classId" element={<StudentClassPage />} />
    <Route path="/student/quizzes/:quizId" element={<h1>Quiz introduction</h1>} />
    <Route path="/student" element={<h1>My classes</h1>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  mocks.showToast.mockClear()
  mocks.leaveClass.mockClear()
  mocks.listEnrollments.mockImplementation((_uid: string, onChange: (items: EnrollmentWithId[]) => void) => { onChange([enrollment]); return () => undefined })
  mocks.watchClass.mockImplementation((_id: string, onChange: (value: ClassWithId) => void) => { onChange(classroom); return () => undefined })
  mocks.watchQuizzes.mockImplementation((_id: string, onChange: (items: never[]) => void) => { onChange([]); return () => undefined })
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
    const start = screen.getByRole('link', { name: 'Start' })
    expect(start).toBeEnabled()
    fireEvent.click(start)
    expect(await screen.findByRole('heading', { name: 'Quiz introduction' })).toBeInTheDocument()
  })
})
