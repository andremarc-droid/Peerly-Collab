import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingRoute, StartRoute } from './MobileRoutes'
import { StartScreen } from './StartScreen'
import { WelcomeScreen } from './WelcomeScreen'

type Role = 'student' | 'instructor'
const mocks = vi.hoisted(() => ({
  status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn',
  role: null as Role | null,
  profileLoading: false,
  mobile: true,
}))

vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ status: mocks.status, user: null }) }))
vi.mock('../profile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: mocks.role ? { role: mocks.role } : null, loading: mocks.profileLoading, error: null }),
}))
vi.mock('../../lib/platform/isMobileView', () => ({ useIsMobileView: () => mocks.mobile }))

beforeEach(() => {
  mocks.status = 'signedOut'
  mocks.role = null
  mocks.profileLoading = false
  mocks.mobile = true
})
afterEach(cleanup)

function renderAt(path: string, ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/start" element={ui} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('WelcomeScreen', () => {
  it('is just a welcome with one way forward, and sign in or sign up comes next', () => {
    renderAt('/', <WelcomeScreen />)

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Peerly Collab' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/start')
    expect(screen.queryByRole('link', { name: /sign in|create account/i })).not.toBeInTheDocument()
  })

  it('is the main landmark the skip link points to, and moves focus to its title', () => {
    renderAt('/', <WelcomeScreen />)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('offers the dashboard instead when the learner is already signed in', () => {
    mocks.status = 'signedIn'
    mocks.role = 'instructor'
    const { unmount } = renderAt('/', <WelcomeScreen />)
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/instructor')
    unmount()

    mocks.role = 'student'
    renderAt('/', <WelcomeScreen />)
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/student')
  })

  it('sends a signed-in account with no role to finish choosing one', () => {
    mocks.status = 'signedIn'
    renderAt('/', <WelcomeScreen />)
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', '/role?mode=continue')
  })

  it('shows no button while the account is still being checked', () => {
    mocks.status = 'loading'
    renderAt('/', <WelcomeScreen />)
    expect(screen.queryByRole('link', { name: /Get started|Open dashboard/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Checking your account' })).toBeInTheDocument()
  })

  it('also waits for the profile of a signed-in account', () => {
    mocks.status = 'signedIn'
    mocks.profileLoading = true
    renderAt('/', <WelcomeScreen />)
    expect(screen.queryByRole('link', { name: /Get started|Open dashboard/ })).not.toBeInTheDocument()
  })
})

describe('StartScreen', () => {
  it('lets the learner create an account or sign in, then continue to the role screen', () => {
    renderAt('/start', <StartScreen />)

    expect(screen.getByRole('heading', { level: 1, name: 'Create an account or sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Create account/ })).toHaveAttribute('href', '/role?mode=signup')
    expect(screen.getByRole('link', { name: /^Sign in/ })).toHaveAttribute('href', '/role?mode=signin')
  })

  it('has a back button to the welcome screen', () => {
    renderAt('/start', <StartScreen />)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  })

  it('puts the title inside the main landmark and moves focus to it', () => {
    renderAt('/start', <StartScreen />)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main-content')
    const title = screen.getByRole('heading', { level: 1 })
    expect(main).toContainElement(title)
    expect(title).toHaveFocus()
  })
})

describe('route switching', () => {
  it('shows the welcome screen on phones and the marketing page on larger screens', () => {
    const phone = renderAt('/', <LandingRoute />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Peerly Collab')
    phone.unmount()

    mocks.mobile = false
    renderAt('/', <LandingRoute />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/together/)
  })

  it('opens the start screen on phones and returns larger screens to the landing page', () => {
    const phone = renderAt('/start', <StartRoute />)
    expect(screen.getByRole('heading', { level: 1, name: 'Create an account or sign in' })).toBeInTheDocument()
    phone.unmount()

    mocks.mobile = false
    render(
      <MemoryRouter initialEntries={['/start']}>
        <Routes>
          <Route path="/" element={<p>Landing page</p>} />
          <Route path="/start" element={<StartRoute />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Landing page')).toBeInTheDocument()
  })
})
