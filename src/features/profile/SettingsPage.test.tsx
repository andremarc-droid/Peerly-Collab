import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

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

afterEach(cleanup)

describe('SettingsPage', () => {
  it('lists the danger zone as its own step and links back to the profile', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    const dangerZone = screen.getByRole('heading', { name: 'Danger zone' }).closest('section')
    expect(dangerZone).not.toBeNull()
    expect(within(dangerZone as HTMLElement).getByRole('link', { name: /open danger zone/i })).toHaveAttribute('href', '/profile/settings/danger-zone')
    expect(screen.getByRole('link', { name: /back to profile/i })).toHaveAttribute('href', '/profile')
  })

  it('does not delete anything from the settings list itself', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })
})
