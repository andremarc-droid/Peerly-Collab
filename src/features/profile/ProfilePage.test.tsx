import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  it('keeps delete account inside Settings rather than as its own page section', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    )
    const settings = screen.getByRole('heading', { name: 'Settings' }).closest('section')
    expect(settings).toHaveTextContent('Danger zone')
    expect(settings).toContainElement(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.queryByRole('heading', { name: 'Danger zone' })).not.toBeInTheDocument()
  })
})
