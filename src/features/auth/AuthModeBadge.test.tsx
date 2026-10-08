import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AuthModeBadge } from './AuthModeBadge'

afterEach(cleanup)

describe('AuthModeBadge', () => {
  it('labels the sign up process', () => {
    render(<AuthModeBadge mode="signup" />)
    expect(screen.getByText('Sign up')).toBeInTheDocument()
  })

  it('labels the sign in process', () => {
    render(<AuthModeBadge mode="signin" />)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('labels the continue process', () => {
    render(<AuthModeBadge mode="continue" />)
    expect(screen.getByText('Continue')).toBeInTheDocument()
  })

  it('appends a detail to the label', () => {
    render(<AuthModeBadge mode="signin" detail="Password reset" />)
    expect(screen.getByText('Sign in · Password reset')).toBeInTheDocument()
  })

  it('shows a padded step counter with an accessible name', () => {
    render(<AuthModeBadge mode="signup" step={2} totalSteps={2} />)
    expect(screen.getByLabelText('Step 2 of 2')).toHaveTextContent('02 / 02')
  })

  it('omits the step counter when no steps are given', () => {
    render(<AuthModeBadge mode="signin" />)
    expect(screen.queryByLabelText(/Step/)).not.toBeInTheDocument()
  })
})
