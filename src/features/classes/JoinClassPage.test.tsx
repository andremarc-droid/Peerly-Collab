import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { PublicRoute } from '../../app/RouteGuards'
import { AUTH_RETURN_TO_KEY } from '../../app/returnTo'
import { ROLE_INTENT_STORAGE_KEY } from '../auth/roleIntent'
import { JoinClassPage } from './JoinClassPage'

const mocks = vi.hoisted(() => ({
  auth: { status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn', user: null as { uid: string; displayName: string } | null, profileStatus: 'ready' as 'loading' | 'ready' | 'error' },
  profile: { profile: null as { name: string; photoURL: string | null; role: 'student' | 'instructor' | null } | null, loading: false, error: null as string | null },
  showToast: vi.fn(), lookup: vi.fn(async () => ({ classId: 'class-1', ownerId: 'teacher', className: 'Biology', ownerName: 'Morgan', joinEnabled: true, requireApproval: false, archived: false })),
  getPreview: vi.fn(), join: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../profile/useUserProfile', () => ({ useUserProfile: () => mocks.profile }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: mocks.showToast }) }))
vi.mock('../../app/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('./services/joinService', () => ({ lookupClassByCode: mocks.lookup, getClassCodePreview: mocks.getPreview, joinClass: mocks.join }))

function SigninRoundTrip() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => {
    mocks.auth.status = 'signedIn'
    mocks.auth.user = { uid: 'student-1', displayName: 'Sam' }
    mocks.profile.profile = { name: 'Sam', photoURL: null, role: 'student' }
    navigate('/signin?complete=1')
  }}>Complete sign in</button>
}

function renderJoin(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/join" element={<JoinClassPage />} />
    <Route path="/join/:code" element={<JoinClassPage />} />
    <Route path="/signin" element={<PublicRoute><SigninRoundTrip /></PublicRoute>} />
    <Route path="/student/classes/:classId" element={<h1>Joined class</h1>} />
    <Route path="/role" element={<h1>Choose a role</h1>} />
  </Routes></MemoryRouter>)
}

beforeEach(() => {
  sessionStorage.clear()
  mocks.auth.status = 'signedOut'
  mocks.auth.user = null
  mocks.profile.profile = null
  mocks.profile.loading = false
  mocks.profile.error = null
  mocks.lookup.mockClear()
  mocks.join.mockReset()
  mocks.lookup.mockResolvedValue({ classId: 'class-1', ownerId: 'teacher', className: 'Biology', ownerName: 'Morgan', joinEnabled: true, requireApproval: false, archived: false })
})
afterEach(cleanup)

describe('join class page', () => {
  it('remembers an invite and student role intent through sign-in, then returns to the invite', async () => {
    renderJoin('/join/ab-c234')
    expect(await screen.findByRole('button', { name: 'Complete sign in' })).toBeInTheDocument()
    expect(sessionStorage.getItem(ROLE_INTENT_STORAGE_KEY)).toBe('{"role":"student","mode":"signin"}')
    expect(sessionStorage.getItem(AUTH_RETURN_TO_KEY)).toBe('/join/ab-c234')
    fireEvent.click(screen.getByRole('button', { name: 'Complete sign in' }))
    expect(await screen.findByRole('heading', { name: 'Biology', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledWith('ABC234', 'student-1'))
  })

  it('normalizes pasted code and displays a class preview for a signed-in student', async () => {
    mocks.auth.status = 'signedIn'
    mocks.auth.user = { uid: 'student-1', displayName: 'Sam' }
    mocks.profile.profile = { name: 'Sam', photoURL: null, role: 'student' }
    renderJoin('/join')
    const code = screen.getByRole('textbox', { name: /^Class code/ })
    fireEvent.change(code, { target: { value: 'ab-c 234' } })
    expect(code).toHaveValue('ABC234')
    fireEvent.click(screen.getByRole('button', { name: 'Find class' }))
    expect(await screen.findByRole('heading', { name: 'Biology' })).toBeInTheDocument()
    expect(screen.getByText('Morgan')).toBeInTheDocument()
    expect(mocks.lookup).toHaveBeenCalledWith('ABC234', 'student-1')
  })

  it('explains to instructors that they must use a student account', () => {
    mocks.auth.status = 'signedIn'
    mocks.auth.user = { uid: 'teacher', displayName: 'Morgan' }
    mocks.profile.profile = { name: 'Morgan', photoURL: null, role: 'instructor' }
    renderJoin('/join/ABC234')
    expect(screen.getByText('Use a student account to join a class.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join class' })).not.toBeInTheDocument()
  })

  it('joins a class and opens its student class page', async () => {
    mocks.auth.status = 'signedIn'
    mocks.auth.user = { uid: 'student-1', displayName: 'Sam' }
    mocks.profile.profile = { name: 'Sam', photoURL: null, role: 'student' }
    mocks.join.mockResolvedValue({ outcome: 'joined', enrollment: { classId: 'class-1' } })
    renderJoin('/join')
    fireEvent.change(screen.getByRole('textbox', { name: /^Class code/ }), { target: { value: 'ABC234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Find class' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Join class' }))
    expect(await screen.findByRole('heading', { name: 'Joined class' })).toBeInTheDocument()
    expect(mocks.join).toHaveBeenCalledWith('ABC234', { uid: 'student-1', name: 'Sam', photoURL: null })
  })
})
