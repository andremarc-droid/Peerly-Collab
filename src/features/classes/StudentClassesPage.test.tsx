import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import type { ReactNode } from 'react'
import { StudentClassesPage } from './StudentClassesPage'
import type { ClassCodeRecord, ClassWithId, EnrollmentWithId } from './types'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), watchClass: vi.fn(), watchQuizzes: vi.fn(), preview: vi.fn(),
}))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'student-1', displayName: 'Sam' } }) }))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('./services/joinService', () => ({ listMyEnrollments: mocks.list, getClassCodePreview: mocks.preview }))
vi.mock('./services/classService', () => ({ watchClass: mocks.watchClass }))
vi.mock('./services/quizService', () => ({ watchPublishedQuizzesForClass: mocks.watchQuizzes }))

const now = Timestamp.fromMillis(1_700_000_000_000)
const activeClass: ClassWithId = {
  id: 'class-active', ownerId: 'teacher', ownerName: 'Morgan', name: 'Biology', section: 'B', subject: 'Science', description: '', joinCode: 'ABC234',
  joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
}
const activeEnrollment: EnrollmentWithId = {
  id: 'class-active_student-1', classId: 'class-active', ownerId: 'teacher', uid: 'student-1', studentName: 'Sam', studentPhotoURL: null,
  className: 'Biology', status: 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now,
}
const pendingEnrollment: EnrollmentWithId = {
  ...activeEnrollment, id: 'class-pending_student-1', classId: 'class-pending', className: 'Chemistry', status: 'pending', codeUsed: 'DEF234',
}
const preview: ClassCodeRecord = { classId: 'class-pending', ownerId: 'teacher', className: 'Chemistry', ownerName: 'Taylor', joinEnabled: true, requireApproval: true, archived: false }

beforeEach(() => {
  mocks.list.mockImplementation((_uid: string, onChange: (items: EnrollmentWithId[]) => void) => { onChange([activeEnrollment, pendingEnrollment]); return () => undefined })
  mocks.watchClass.mockImplementation((_id: string, onChange: (value: ClassWithId) => void) => { onChange(activeClass); return () => undefined })
  mocks.watchQuizzes.mockImplementation((_id: string, onChange: (items: never[]) => void) => { onChange([]); return () => undefined })
  mocks.preview.mockResolvedValue(preview)
})
afterEach(cleanup)

describe('student classes dashboard', () => {
  it('shows active class details, quiz count, pending status, and a working join link', async () => {
    render(<MemoryRouter><StudentClassesPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Biology' })).toBeInTheDocument()
    expect(screen.getByText(/Instructor Morgan/)).toBeInTheDocument()
    expect(screen.getByText('0 published quizzes')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Chemistry' })).toBeInTheDocument()
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join class' })).toHaveAttribute('href', '/join')
  })
})
