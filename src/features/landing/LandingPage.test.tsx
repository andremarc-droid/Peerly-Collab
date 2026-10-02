import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

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
