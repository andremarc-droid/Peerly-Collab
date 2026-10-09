import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../app/AppShell'
import { PageHeader } from '../../shared/ui/PageHeader'

const view = vi.hoisted(() => ({ mobile: true }))
const mocks = vi.hoisted(() => ({
  role: 'instructor' as 'instructor' | 'student' | null,
  name: 'Ada',
  email: 'ada@example.com',
  photoURL: null as string | null,
  signOut: vi.fn(async () => undefined),
}))

vi.mock('../../lib/platform/isMobileView', () => ({ useIsMobileView: () => view.mobile }))
vi.mock('../auth/authService', () => ({ signOutCurrentUser: () => mocks.signOut() }))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', displayName: mocks.name, email: mocks.email },
    status: 'signedIn',
  }),
}))
vi.mock('../profile/useUserProfile', () => ({
  useUserProfile: () => ({
    profile: mocks.role
      ? { role: mocks.role, name: mocks.name, email: mocks.email, photoURL: mocks.photoURL }
      : null,
    loading: false,
    error: null,
  }),
}))

afterEach(cleanup)
beforeEach(() => {
  view.mobile = true
  mocks.role = 'instructor'
  mocks.signOut.mockClear()
})

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <AppShell>
              <PageHeader eyebrow="INSTRUCTOR SPACE" title="My classes." subtitle="Organize learners." action={<button type="button">Create class</button>} />
              <main id="main-content" className="app-shell__content">Dashboard body</main>
            </AppShell>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('signed-in phone dashboard', () => {
  it('uses the Material shell with a bottom bar on instructor home', () => {
    renderShell('/instructor')
    expect(screen.getByRole('link', { name: 'Peerly Collab home' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Instructor navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Quizzes' })).toHaveAttribute('href', '/instructor/quizzes')
    expect(screen.getByRole('link', { name: 'Learning' })).toHaveAttribute('href', '/instructor/learning')
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile')
    expect(document.querySelector('.app-shell')).toHaveClass('app-shell--m3', 'app-shell--tab')
    expect(screen.getByRole('heading', { level: 1, name: 'My classes.' })).toHaveFocus()
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('uses a three-item bar for students', () => {
    mocks.role = 'student'
    renderShell('/student')
    const nav = screen.getByRole('navigation', { name: 'Student navigation' })
    expect(nav).toHaveClass('grid-cols-3')
    expect(screen.queryByRole('link', { name: 'Quizzes' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Classes' })).toHaveAttribute('href', '/student')
  })

  it('hides the bottom bar on a pushed class screen and offers Back', () => {
    renderShell('/instructor/classes/c1')
    expect(screen.queryByRole('navigation', { name: 'Instructor navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/instructor')
    expect(document.querySelector('.app-shell')).toHaveClass('app-shell--stack')
  })

  it('keeps the desktop navy header when the window is not a phone', () => {
    view.mobile = false
    renderShell('/instructor')
    expect(document.querySelector('.app-shell')).not.toHaveClass('app-shell--m3')
    expect(screen.getByRole('navigation', { name: 'Instructor navigation' })).not.toHaveClass('m3-nav')
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('opens the account menu from the avatar and can sign out', async () => {
    renderShell('/instructor')
    fireEvent.click(screen.getByRole('button', { name: 'Open account menu' }))
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })
})
