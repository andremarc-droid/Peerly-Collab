import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailVerificationPage } from '../auth/EmailVerificationPage'
import { ForgotPasswordPage } from '../auth/ForgotPasswordPage'
import { readRoleIntent, saveRoleIntent, type RoleIntent } from '../auth/roleIntent'
import { RolePage } from '../auth/RolePage'
import { SigninPage } from '../auth/SigninPage'
import { SignupPage } from '../auth/SignupPage'

const view = vi.hoisted(() => ({ mobile: true }))
const mocks = vi.hoisted(() => ({
  status: 'signedOut' as 'loading' | 'signedOut' | 'signedIn',
  completeRoleSelection: vi.fn(async (_role: string) => null),
  clearAuthError: vi.fn(),
  refreshEmailVerification: vi.fn(),
  user: { uid: 'user-1', email: 'learner@example.com' },
}))
const service = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  createEmailAccount: vi.fn(),
  sendPasswordReset: vi.fn(),
  resendVerificationEmail: vi.fn(),
}))

// Same approach as mobile.test.tsx: the hook is replaced by a flag the test can flip.
vi.mock('../../lib/platform/isMobileView', () => ({ useIsMobileView: () => view.mobile }))
vi.mock('../auth/authService', () => service)
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    status: mocks.status,
    authError: null,
    clearAuthError: mocks.clearAuthError,
    completeRoleSelection: mocks.completeRoleSelection,
    refreshEmailVerification: mocks.refreshEmailVerification,
    user: mocks.user,
  }),
}))

function routes() {
  return (
    <MemoryRouter initialEntries={[currentPath]}>
      <Routes>
        <Route path="/start" element={<h1>Start page</h1>} />
        <Route path="/role" element={<RolePage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/signin" element={<SigninPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify" element={<EmailVerificationPage role="student" />} />
        <Route path="/student" element={<h1>Student dashboard</h1>} />
        <Route path="/instructor" element={<h1>Instructor dashboard</h1>} />
      </Routes>
    </MemoryRouter>
  )
}

let currentPath = '/'
function renderAt(path: string) {
  currentPath = path
  return render(routes())
}

/** The h1 of the screen that is showing, which must also be the only one and hold focus after the screen opens. */
function expectScreenTitle(name: string) {
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  const title = screen.getByRole('heading', { level: 1, name })
  expect(title).toHaveFocus()
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  expect(screen.getByRole('main')).toContainElement(title)
}

beforeEach(() => {
  view.mobile = true
  mocks.status = 'signedOut'
  mocks.refreshEmailVerification.mockResolvedValue(false)
  service.resendVerificationEmail.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.resetAllMocks()
})

describe('phone role screen', () => {
  it('has one h1 that takes focus, the main landmark and a radio group of two roles', () => {
    renderAt('/role?mode=signup')

    expectScreenTitle('Are you a student or an instructor?')
    expect(within(screen.getByRole('radiogroup', { name: 'Choose your role' })).getAllByRole('radio')).toHaveLength(2)
  })

  it('keeps Continue disabled until a card is chosen, then selects with a click', async () => {
    const user = userEvent.setup()
    renderAt('/role?mode=signup')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.click(screen.getByRole('radio', { name: /Student/ }))

    expect(screen.getByRole('radio', { name: /Student/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Instructor/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('selects with the arrow keys and wraps around', async () => {
    const user = userEvent.setup()
    renderAt('/role?mode=signup')
    screen.getByRole('radio', { name: /Student/ }).focus()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /Instructor/ })).toHaveFocus()
    expect(screen.getByRole('radio', { name: /Instructor/ })).toBeChecked()

    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: /Student/ })).toBeChecked()

    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('radio', { name: /Instructor/ })).toBeChecked()
  })

  it('saves the role for sign up and opens the sign-up form', async () => {
    const user = userEvent.setup()
    renderAt('/role?mode=signup')
    await user.click(screen.getByRole('radio', { name: /Instructor/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'signup' })
    expectScreenTitle('Create account')
  })

  it('saves the role for sign in and opens the sign-in form', async () => {
    const user = userEvent.setup()
    renderAt('/role?mode=signin')
    await user.click(screen.getByRole('radio', { name: /Student/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'student', mode: 'signin' })
  })

  it.each(['signup', 'signin'])('goes back to the start screen from %s mode', async (mode) => {
    const user = userEvent.setup()
    renderAt(`/role?mode=${mode}`)
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/start')

    await user.click(screen.getByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Start page' })).toBeInTheDocument()
  })

  it('has no Back button in continue mode and saves the missing role', async () => {
    mocks.status = 'signedIn'
    const user = userEvent.setup()
    renderAt('/role?mode=continue')
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Instructor/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('heading', { name: 'Instructor dashboard' })).toBeInTheDocument()
    expect(mocks.completeRoleSelection).toHaveBeenCalledWith('instructor')
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'continue' })
  })

  it('sends a signed-out visitor from continue mode to sign in mode, with Back to the start screen', async () => {
    renderAt('/role?mode=continue')

    expect(await screen.findByRole('link', { name: 'Back' })).toHaveAttribute('href', '/start')
    expect(screen.getByText('Pick the role you signed up with.')).toBeInTheDocument()
  })

  it('shows an announced error when the role cannot be saved', async () => {
    mocks.status = 'signedIn'
    mocks.completeRoleSelection.mockRejectedValueOnce({ code: 'auth/network-request-failed' })
    const user = userEvent.setup()
    renderAt('/role?mode=continue')
    await user.click(screen.getByRole('radio', { name: /Student/ }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Role not saved')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })
})

describe('phone sign-in screen', () => {
  beforeEach(() => saveRoleIntent({ role: 'instructor', mode: 'signin' }))

  it('has one h1 that takes focus, the main landmark and a Back button to the role screen', () => {
    renderAt('/signin?mode=signin')

    expectScreenTitle('Sign in')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/role?mode=signin')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
  })

  it('sends people with no saved role back to the role screen', async () => {
    sessionStorage.clear()
    renderAt('/signin?mode=signin')
    expect(await screen.findByRole('heading', { name: 'Are you a student or an instructor?' })).toBeInTheDocument()
  })

  it('announces every validation message and moves focus to the first invalid field', async () => {
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const email = screen.getByLabelText('Email address')
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Enter your email address.')
    await waitFor(() => expect(email).toHaveFocus())
    expect(service.signInWithEmail).not.toHaveBeenCalled()
  })

  it('marks a field invalid only while it has an error', async () => {
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email address'), 'a')
    expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid')
  })

  it('shows and hides the password with the toggle', async () => {
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('signs in with the trimmed email', async () => {
    service.signInWithEmail.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    await user.type(screen.getByLabelText('Email address'), '  ada@example.com  ')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(service.signInWithEmail).toHaveBeenCalledWith('ada@example.com', 'password123'))
  })

  it('signs in with Google only for an account that already exists', async () => {
    service.signInWithGoogle.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    await waitFor(() => expect(service.signInWithGoogle).toHaveBeenCalledWith({ requireExistingAccount: true }))
  })

  it('shows the not-registered pop-up and sends the person to sign up with the same role', async () => {
    service.signInWithEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('dialog', { name: 'Account not registered' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'signup' })
  })

  it('announces a wrong password as an alert', async () => {
    service.signInWithEmail.mockRejectedValue({ code: 'auth/wrong-password' })
    const user = userEvent.setup()
    renderAt('/signin?mode=signin')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That password is incorrect. Try again or reset it.')
  })

  it('keeps what was typed when the window grows past the phone breakpoint', async () => {
    const user = userEvent.setup()
    const { rerender } = renderAt('/signin?mode=signin')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')

    view.mobile = false
    rerender(routes())

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toHaveValue('ada@example.com')
  })
})

describe('phone sign-up screen', () => {
  function startSignup(role: RoleIntent['role']) {
    saveRoleIntent({ role, mode: 'signup' })
    return renderAt('/signup?mode=signup')
  }

  it('has one h1 that takes focus, the main landmark and a Back button to the role screen', () => {
    startSignup('instructor')

    expectScreenTitle('Create account')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/role?mode=signup')
  })

  it('asks students for their age and instructors do not get the field', () => {
    startSignup('student')
    expect(screen.getByLabelText('Age')).toBeInTheDocument()
    cleanup()

    startSignup('instructor')
    expect(screen.queryByLabelText('Age')).not.toBeInTheDocument()
  })

  it('announces all validation messages for a student and focuses the age field first', async () => {
    const user = userEvent.setup()
    startSignup('student')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter your age.')).toBeInTheDocument()
    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByText('Confirm your password.')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(5)
    await waitFor(() => expect(screen.getByLabelText('Age')).toHaveFocus())
    expect(service.createEmailAccount).not.toHaveBeenCalled()
  })

  it('catches passwords that do not match', async () => {
    const user = userEvent.setup()
    startSignup('instructor')
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'password124')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Confirm password')).toHaveFocus())
  })

  it('toggles the two password fields separately', async () => {
    const user = userEvent.setup()
    startSignup('instructor')
    await user.click(screen.getByRole('button', { name: 'Show confirm password' }))

    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('creates the account and keeps the student age in the saved role intent', async () => {
    service.createEmailAccount.mockResolvedValue(undefined)
    const user = userEvent.setup()
    startSignup('student')
    await user.type(screen.getByLabelText('Age'), '2a0')
    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.type(screen.getByLabelText('Confirm password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(service.createEmailAccount).toHaveBeenCalledWith('Ada', 'ada@example.com', 'password123'))
    expect(readRoleIntent()).toEqual({ role: 'student', mode: 'signup', age: 20 })
  })

  it('stops Google sign-up for a student until the age is valid', async () => {
    const user = userEvent.setup()
    startSignup('student')
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))

    expect(await screen.findByText('Enter your age.')).toBeInTheDocument()
    expect(service.signInWithGoogle).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByLabelText('Age')).toHaveFocus())
  })
})

describe('phone forgot-password screen', () => {
  it('has one h1 that takes focus, the main landmark and a Back button to sign in', () => {
    renderAt('/forgot-password')

    expectScreenTitle('Reset password')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/signin')
  })

  it('announces an invalid email and focuses it', async () => {
    const user = userEvent.setup()
    renderAt('/forgot-password')
    await user.type(screen.getByLabelText('Email address'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.')
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus())
    expect(service.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('sends the link and confirms it', async () => {
    service.sendPasswordReset.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderAt('/forgot-password')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
    expect(service.sendPasswordReset).toHaveBeenCalledWith('ada@example.com')
  })
})

describe('phone email verification screen', () => {
  it('has one h1 that takes focus, the main landmark, the email address and no Back button', () => {
    renderAt('/verify')

    expectScreenTitle('Verify your email')
    expect(screen.getByText('learner@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('stays on the screen when the email is not verified yet', async () => {
    const user = userEvent.setup()
    renderAt('/verify')
    await user.click(screen.getByRole('button', { name: 'Check verification' }))

    expect(await screen.findByText('Your email is not verified yet. Check your inbox, then try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument()
  })

  it('opens the dashboard once the email is verified', async () => {
    mocks.refreshEmailVerification.mockResolvedValue(true)
    const user = userEvent.setup()
    renderAt('/verify')
    await user.click(screen.getByRole('button', { name: 'Check verification' }))

    expect(await screen.findByRole('heading', { name: 'Student dashboard' })).toBeInTheDocument()
  })

  it('resends the email and starts the cooldown', async () => {
    const user = userEvent.setup()
    renderAt('/verify')
    await user.click(screen.getByRole('button', { name: 'Resend verification email' }))

    expect(await screen.findByText('A new verification email is on its way.')).toBeInTheDocument()
    expect(service.resendVerificationEmail).toHaveBeenCalledWith(mocks.user)
    expect(screen.getByRole('button', { name: /Resend in 60s/ })).toBeDisabled()
  })
})
