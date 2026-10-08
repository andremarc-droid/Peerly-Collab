import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SigninPage } from './SigninPage'
import { AccountNotRegisteredError } from './authErrors'
import { markAccountNotRegistered } from './notRegisteredMark'
import { readRoleIntent, saveRoleIntent } from './roleIntent'

const mockService = vi.hoisted(() => ({ signInWithEmail: vi.fn(), signInWithGoogle: vi.fn() }))
vi.mock('./authService', () => mockService)
vi.mock('./useAuth', () => ({ useAuth: () => ({ authError: null, clearAuthError: vi.fn() }) }))

function renderSignin() {
  return render(
    <MemoryRouter initialEntries={['/signin?mode=signin']}>
      <Routes>
        <Route path="/signin" element={<SigninPage />} />
        <Route path="/signup" element={<h1>Signup form</h1>} />
        <Route path="/role" element={<h1>Role choice</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function submitEmailSignin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
  await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => saveRoleIntent({ role: 'instructor', mode: 'signin' }))

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  mockService.signInWithEmail.mockReset()
  mockService.signInWithGoogle.mockReset()
})

describe('sign in with an unregistered account', () => {
  it('shows the not-registered pop-up for an unknown email', async () => {
    mockService.signInWithEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    const user = userEvent.setup()
    renderSignin()
    await submitEmailSignin(user)
    const dialog = await screen.findByRole('dialog', { name: 'Account not registered' })
    expect(dialog).toHaveTextContent('This account hasn’t been registered yet. Create an account?')
  })

  it('sends the person to sign up with their chosen role when they press Sign up', async () => {
    mockService.signInWithEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    const user = userEvent.setup()
    renderSignin()
    await submitEmailSignin(user)
    await user.click(await screen.findByRole('button', { name: 'Sign up' }))
    expect(await screen.findByRole('heading', { name: 'Signup form' })).toBeInTheDocument()
    expect(readRoleIntent()).toEqual({ role: 'instructor', mode: 'signup' })
  })

  it('closes the pop-up and stays on sign in when they choose Not now', async () => {
    mockService.signInWithEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    const user = userEvent.setup()
    renderSignin()
    await submitEmailSignin(user)
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()
  })

  it('shows the pop-up when Google reports an unregistered account', async () => {
    mockService.signInWithGoogle.mockRejectedValue(new AccountNotRegisteredError())
    const user = userEvent.setup()
    renderSignin()
    await user.click(screen.getByRole('button', { name: /Continue with Google/ }))
    expect(await screen.findByRole('dialog', { name: 'Account not registered' })).toBeInTheDocument()
    expect(mockService.signInWithGoogle).toHaveBeenCalledWith({ requireExistingAccount: true })
  })

  it('shows the pop-up after a Google redirect was rejected', async () => {
    markAccountNotRegistered()
    renderSignin()
    expect(await screen.findByRole('dialog', { name: 'Account not registered' })).toBeInTheDocument()
  })

  it('does not show the pop-up for a wrong password', async () => {
    mockService.signInWithEmail.mockRejectedValue({ code: 'auth/wrong-password' })
    const user = userEvent.setup()
    renderSignin()
    await submitEmailSignin(user)
    expect(await screen.findByText('That password is incorrect. Try again or reset it.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
