import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import { saveRoleIntent } from './roleIntent'

const mockAuth = vi.hoisted(() => ({ status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn' }))
vi.mock('./useAuth', () => ({ useAuth: () => ({ ...mockAuth, user: null, authError: null, clearAuthError: () => {} }) }))

function LocationOutput() {
  const current = useLocation()
  return <p>{current.pathname}{current.search}</p>
}

function renderAuthGate(path: '/signup' | '/signin') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/signup" element={<AuthGate mode="signup">{(role) => <h1>{role} signup form</h1>}</AuthGate>} />
        <Route path="/signin" element={<AuthGate mode="signin">{(role) => <h1>{role} signin form</h1>}</AuthGate>} />
        <Route path="/role" element={<LocationOutput />} />
        <Route path="/welcome" element={<h1>Welcome</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  mockAuth.status = 'signedOut'
})

describe('auth route gate', () => {
  it.each([['/signup', 'signup'], ['/signin', 'signin']] as const)('asks for a role before %s', async (path, mode) => {
    renderAuthGate(path)
    expect(await screen.findByText(`/role?mode=${mode}`)).toBeInTheDocument()
  })

  it('renders the selected role in the signup flow', () => {
    saveRoleIntent({ role: 'instructor', mode: 'signup' })
    renderAuthGate('/signup')
    expect(screen.getByRole('heading', { name: 'instructor signup form' })).toBeInTheDocument()
  })

  it('sends an existing session to welcome', () => {
    mockAuth.status = 'signedIn'
    saveRoleIntent({ role: 'student', mode: 'signin' })
    renderAuthGate('/signin')
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
  })
})
