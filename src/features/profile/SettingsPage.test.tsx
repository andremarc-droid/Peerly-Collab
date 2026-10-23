import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/ui/ToastProvider'
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

vi.mock('../scoreboard/services', () => ({
  updateScoreboardOptIn: vi.fn().mockResolvedValue({ success: true, optIn: true }),
}))

afterEach(cleanup)

describe('SettingsPage', () => {
  it('renders the scoreboard privacy section with switch and display name input', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Scoreboard & Privacy')).toBeInTheDocument()
    expect(screen.getByLabelText(/show me on the public scoreboard/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/scoreboard display name/i)).toBeInTheDocument()
  })

  it('lists the danger zone as its own step and links back to the profile', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    const dangerZone = screen.getByRole('heading', { name: 'Danger zone' }).closest('section')
    expect(dangerZone).not.toBeNull()
    expect(within(dangerZone as HTMLElement).getByRole('link', { name: /open danger zone/i })).toHaveAttribute('href', '/profile/settings/danger-zone')
    expect(screen.getByRole('link', { name: /back to profile/i })).toHaveAttribute('href', '/profile')
  })

  it('does not delete anything from the settings list itself', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
  })
})
