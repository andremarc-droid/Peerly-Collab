import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

const mocks = vi.hoisted(() => ({ status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn' }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ status: mocks.status, user: null }) }))
vi.mock('../profile/useUserProfile', () => ({ useUserProfile: () => ({ profile: null, loading: false, error: null }) }))

afterEach(cleanup)

describe('landing page entry points', () => {
  it('sends every Get started and Sign in action to the matching role mode', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>)
    const signupLinks = screen.getAllByRole('link', { name: /Get started/ })
    const signinLinks = screen.getAllByRole('link', { name: 'Sign in' })

    expect(signupLinks.length).toBeGreaterThan(1)
    expect(signupLinks.every((link) => link.getAttribute('href') === '/role?mode=signup')).toBe(true)
    expect(signinLinks.length).toBeGreaterThan(1)
    expect(signinLinks.every((link) => link.getAttribute('href') === '/role?mode=signin')).toBe(true)
  })
})
