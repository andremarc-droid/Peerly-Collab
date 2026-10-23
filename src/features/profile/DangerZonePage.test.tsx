import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DangerZonePage } from './DangerZonePage'

vi.mock('../../app/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AppShellLoading: () => <div>Loading</div>,
}))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', email: 'ada@example.com', providerData: [] },
    status: 'signedIn',
    profileStatus: 'ready',
    profileError: null,
    retryProfileSetup: vi.fn(),
  }),
}))
vi.mock('./useUserProfile', () => ({
  useUserProfile: () => ({
    profile: { uid: 'user-1', name: 'Ada', email: 'ada@example.com', photoURL: null, role: 'student', createdAt: 1, updatedAt: 1 },
    loading: false,
    error: null,
  }),
}))
vi.mock('../auth/authService', () => ({
  hasPasswordProvider: () => false,
  signOutCurrentUser: vi.fn(),
}))
const deleteAccount = vi.fn()
vi.mock('./accountDeletion', () => ({ deleteAccount: (...args: unknown[]) => deleteAccount(...args) }))

afterEach(() => {
  cleanup()
  deleteAccount.mockReset()
})

describe('DangerZonePage', () => {
  it('links back to settings and keeps delete account behind its own page', () => {
    render(
      <MemoryRouter>
        <DangerZonePage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to settings/i })).toHaveAttribute('href', '/profile/settings')
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
  })

  it('asks for confirmation instead of deleting straight away', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <DangerZonePage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByText('Delete your account?')).toBeInTheDocument()
    expect(screen.getByLabelText('Type your email address to confirm')).toBeInTheDocument()
    expect(deleteAccount).not.toHaveBeenCalled()
  })
})
