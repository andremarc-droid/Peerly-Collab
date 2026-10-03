import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Timestamp } from 'firebase/firestore'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/ui/ToastProvider'
import { ClassCodePanel } from './ClassCodePanel'
import { ClassPeopleTab } from './ClassPeopleTab'
import { ClassSettingsTab } from './ClassSettingsTab'
import { inviteUrl } from './classUtilities'
import type { ClassWithId, EnrollmentWithId } from './types'

const mocked = vi.hoisted(() => ({
  showToast: vi.fn(), onRegenerate: vi.fn(),
  approveEnrollment: vi.fn(async () => undefined), declineEnrollment: vi.fn(async () => undefined),
  removeStudent: vi.fn(async () => undefined), blockStudent: vi.fn(async () => undefined), unblockStudent: vi.fn(async () => undefined),
  deleteClassCascade: vi.fn(async () => undefined), archiveClass: vi.fn(async () => undefined), restoreClass: vi.fn(async () => undefined),
}))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocked.showToast }) }))
vi.mock('./services/enrollmentService', () => ({
  approveEnrollment: mocked.approveEnrollment, declineEnrollment: mocked.declineEnrollment,
  removeStudent: mocked.removeStudent, blockStudent: mocked.blockStudent, unblockStudent: mocked.unblockStudent,
  buildRosterCsv: () => 'Student name\r\n"Alex"',
}))
vi.mock('./services', () => ({
  updateClass: vi.fn(async () => undefined), setJoinEnabled: vi.fn(async () => undefined), setRequireApproval: vi.fn(async () => undefined),
  archiveClass: mocked.archiveClass, restoreClass: mocked.restoreClass, deleteClassCascade: mocked.deleteClassCascade,
}))

const now = Timestamp.fromMillis(1_700_000_000_000)
const classroom: ClassWithId = {
  id: 'class-1', ownerId: 'teacher', ownerName: 'Teacher', name: 'Biology', section: 'B', subject: 'Science', description: '',
  joinCode: 'ABC234', joinEnabled: true, requireApproval: true, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
}
const enrollment = (uid: string, status: EnrollmentWithId['status']): EnrollmentWithId => ({
  id: `class-1_${uid}`, classId: 'class-1', ownerId: 'teacher', uid, studentName: 'Alex Student', studentPhotoURL: null,
  className: 'Biology', status, codeUsed: 'ABC234', joinedAt: now, updatedAt: now,
})

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
function renderWithToast(element: ReactNode) { return render(<MemoryRouter><ToastProvider>{element}</ToastProvider></MemoryRouter>) }

describe('classroom interactions', () => {
  it('formats the invite URL with the class code', () => {
    expect(inviteUrl('https://peerly.example/', 'ABC234')).toBe('https://peerly.example/join/ABC234')
  })

  it('copies the class code and asks for confirmation before regenerating it', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const regenerate = vi.fn(async () => undefined)
    renderWithToast(<ClassCodePanel classroom={classroom} onJoiningChange={vi.fn()} onRegenerate={regenerate} busy={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC234'))
    expect(mocked.showToast).toHaveBeenCalledWith('success', 'Join code copied.')
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate code' }))
    expect(screen.getByText(/current code will stop working immediately/i)).toBeInTheDocument()
    expect(regenerate).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerate code' }))
    await waitFor(() => expect(regenerate).toHaveBeenCalledOnce())
  })

  it('runs pending approval and decline actions and confirms remove and block actions', async () => {
    renderWithToast(<ClassPeopleTab classroom={classroom} enrollments={[enrollment('one', 'pending'), enrollment('two', 'active')]} counts={{ students: 1, pending: 1 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mocked.approveEnrollment).toHaveBeenCalledWith('class-1', 'one'))
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(mocked.declineEnrollment).toHaveBeenCalledWith('class-1', 'one'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alex Student' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove student' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove student' }))
    await waitFor(() => expect(mocked.removeStudent).toHaveBeenCalledWith('class-1', 'two'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Alex Student' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Block student' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Block student' }))
    await waitFor(() => expect(mocked.blockStudent).toHaveBeenCalledWith('class-1', 'two'))
  })

  it('unblocks a blocked student', async () => {
    renderWithToast(<ClassPeopleTab classroom={classroom} enrollments={[enrollment('three', 'blocked')]} counts={{ students: 0, pending: 0 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unblock' }))
    await waitFor(() => expect(mocked.unblockStudent).toHaveBeenCalledWith('class-1', 'three'))
  })

  it('requires the exact class name before deleting enrollments and quizzes', () => {
    renderWithToast(<ClassSettingsTab classroom={classroom} counts={{ students: 4, quizzes: 2 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete class' }))
    expect(screen.getByText(/4 student enrollments and 2 quizzes/i)).toBeInTheDocument()
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete class' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type Biology to confirm'), { target: { value: 'Biology' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(mocked.deleteClassCascade).toHaveBeenCalledWith('class-1')
  })
})
