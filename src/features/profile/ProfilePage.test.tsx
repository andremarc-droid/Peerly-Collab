import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'

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
    profile: {
      uid: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      photoURL: null,
      role: 'student',
      createdAt: 1,
      updatedAt: 1,
    },
    loading: false,
    error: null,
  }),
}))
vi.mock('firebase/auth', () => ({ updateProfile: vi.fn() }))
vi.mock('../auth/authService', () => ({
  hasPasswordProvider: () => false,
  signOutCurrentUser: vi.fn(),
}))

afterEach(cleanup)

describe('ProfilePage', () => {
  it('opens Settings from the profile and no longer offers account deletion itself', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    )
    const settings = screen.getByRole('heading', { name: 'Settings' }).closest('section')
    expect(settings).not.toBeNull()
    expect(within(settings as HTMLElement).getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/profile/settings')
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.queryByText('Danger zone')).not.toBeInTheDocument()
  })
})
