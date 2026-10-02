import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute, PublicRoute, RoleRoute } from './RouteGuards'
import { rememberReturnTo } from './returnTo'

const mocks = vi.hoisted(() => ({
  auth: { status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn', profileStatus: 'ready' as 'loading' | 'ready' | 'error', profileError: null as string | null, retryProfileSetup: vi.fn() },
  profile: { profile: null as { uid: string; name: string; email: string | null; photoURL: string | null; role: 'student' | 'instructor' | null; createdAt: number; updatedAt: number } | null, loading: false, error: null as string | null },
}))

vi.mock('../features/auth/useAuth', () => ({ useAuth: () => ({ ...mocks.auth, user: mocks.auth.status === 'signedIn' ? { uid: 'user-1' } : null }) }))
vi.mock('../features/profile/useUserProfile', () => ({ useUserProfile: () => mocks.profile }))

function CurrentLocation() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <p>{location.pathname}{location.search}{from ? ` from ${from}` : ''}</p>
}

function renderRoutes(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/instructor" element={<ProtectedRoute><RoleRoute allowedRoles={['instructor']}><h1>Instructor dashboard</h1></RoleRoute></ProtectedRoute>} />
        <Route path="/student" element={<ProtectedRoute><RoleRoute allowedRoles={['student']}><h1>Student dashboard</h1></RoleRoute></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><h1>Profile page</h1></ProtectedRoute>} />
        <Route path="/signin" element={<PublicRoute><h1>Sign in form</h1></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><h1>Signup form</h1></PublicRoute>} />
        <Route path="/role" element={<PublicRoute><><h1>Role chooser</h1><CurrentLocation /></></PublicRoute>} />
        <Route path="*" element={<CurrentLocation />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  mocks.auth.status = 'signedOut'
  mocks.auth.profileStatus = 'ready'
  mocks.auth.profileError = null
  mocks.profile.profile = null
  mocks.profile.loading = false
  mocks.profile.error = null
})

afterEach(cleanup)

describe('application route guards', () => {
  it('sends signed-out dashboard visitors to sign-in role selection and remembers their destination', async () => {
    renderRoutes('/instructor?tab=recent')
    expect(await screen.findByText('/role?mode=signin from /instructor?tab=recent')).toBeInTheDocument()
  })

  it('sends signed-in accounts without a role to continuation role selection', async () => {
    mocks.auth.status = 'signedIn'
    renderRoutes('/profile')
    expect(await screen.findByText('/role?mode=continue from /profile')).toBeInTheDocument()
  })

  it('sends a student away from an instructor route to the student home', async () => {
    mocks.auth.status = 'signedIn'
    mocks.profile.profile = { uid: 'user-1', name: 'Sam', email: 'sam@example.com', photoURL: null, role: 'student', createdAt: 1, updatedAt: 1 }
    renderRoutes('/instructor')
    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('lets an instructor open the instructor route', () => {
    mocks.auth.status = 'signedIn'
    mocks.profile.profile = { uid: 'user-1', name: 'Lee', email: 'lee@example.com', photoURL: null, role: 'instructor', createdAt: 1, updatedAt: 1 }
    renderRoutes('/instructor')
    expect(screen.getByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
  })

  it('redirects signed-in users away from sign-in to their own dashboard', async () => {
    mocks.auth.status = 'signedIn'
    mocks.profile.profile = { uid: 'user-1', name: 'Lee', email: 'lee@example.com', photoURL: null, role: 'instructor', createdAt: 1, updatedAt: 1 }
    renderRoutes('/signin')
    expect(await screen.findByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
  })

  it('returns a signed-in user to the page they originally requested', async () => {
    mocks.auth.status = 'signedIn'
    mocks.profile.profile = { uid: 'user-1', name: 'Lee', email: 'lee@example.com', photoURL: null, role: 'instructor', createdAt: 1, updatedAt: 1 }
    rememberReturnTo('/instructor?tab=shared')
    renderRoutes('/signin')
    expect(await screen.findByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
  })

  it('keeps a public signup route available while signed out', () => {
    renderRoutes('/signup')
    expect(screen.getByRole('heading', { name: 'Signup form' })).toBeInTheDocument()
  })

  it('sends a signed-in account with no role from sign-in to continuation', async () => {
    mocks.auth.status = 'signedIn'
    renderRoutes('/signin')
    expect(await screen.findByText('/role?mode=continue from /signin')).toBeInTheDocument()
  })

  it('keeps the continuation chooser available to a signed-in account with no role', () => {
    mocks.auth.status = 'signedIn'
    renderRoutes('/role?mode=continue')
    expect(screen.getByRole('heading', { name: 'Role chooser' })).toBeInTheDocument()
  })
})
