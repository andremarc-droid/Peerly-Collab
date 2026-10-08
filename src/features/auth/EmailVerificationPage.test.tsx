import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EmailVerificationPage } from './EmailVerificationPage'

const mocks = vi.hoisted(() => ({
  user: { uid: 'user-1', email: 'learner@example.com' },
  refreshEmailVerification: vi.fn(),
  resendVerificationEmail: vi.fn(),
}))

vi.mock('./useAuth', () => ({
  useAuth: () => ({ user: mocks.user, refreshEmailVerification: mocks.refreshEmailVerification }),
}))
vi.mock('./authService', () => ({ resendVerificationEmail: mocks.resendVerificationEmail }))

function renderPage(role: 'student' | 'instructor' = 'student') {
  return render(
    <MemoryRouter initialEntries={['/verify']}>
      <Routes>
        <Route path="/verify" element={<EmailVerificationPage role={role} />} />
        <Route path="/student" element={<h1>Student dashboard</h1>} />
        <Route path="/instructor" element={<h1>Instructor dashboard</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.refreshEmailVerification.mockResolvedValue(false)
  mocks.resendVerificationEmail.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('EmailVerificationPage', () => {
  it('resends verification mail to the signed-in account and confirms success', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }))

    await waitFor(() => expect(mocks.resendVerificationEmail).toHaveBeenCalledWith(mocks.user))
    expect(await screen.findByText('A new verification email is on its way.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Resend in 60s/ })).toBeDisabled()
  })

  it('keeps the user on the verification page when the email is not yet verified', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'I already verified via email' }))

    expect(await screen.findByText('Your email is not verified yet. Check your inbox, then try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  })

  it('refreshes verification status and redirects to the role dashboard when verified', async () => {
    mocks.refreshEmailVerification.mockResolvedValue(true)
    renderPage('instructor')
    fireEvent.click(screen.getByRole('button', { name: 'I already verified via email' }))

    expect(await screen.findByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
    expect(mocks.refreshEmailVerification).toHaveBeenCalledOnce()
  })
})
