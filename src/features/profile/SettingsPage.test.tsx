import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/ui/ToastProvider'
import { callUpdateScoreboardOptIn } from '../scoreboard/services'
import { SettingsPage } from './SettingsPage'

let mockUserProfile: any = {
  uid: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
  photoURL: null,
  role: 'student',
  age: 20,
  createdAt: 1,
  updatedAt: 1,
}

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
    profile: mockUserProfile,
    retryProfileSetup: vi.fn(),
  }),
}))

vi.mock('./useUserProfile', () => ({
  useUserProfile: () => ({
    profile: mockUserProfile,
    loading: false,
    error: null,
  }),
}))

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<any>('firebase/firestore')
  return {
    ...actual,
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({
        scoreboardOptIn: true,
        scoreboardDisplayName: 'CustomScoreboardName',
      }),
    }),
  }
})

vi.mock('../scoreboard/services', () => ({
  callUpdateScoreboardOptIn: vi.fn().mockResolvedValue({ success: true, optIn: true }),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    mockUserProfile = {
      uid: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      photoURL: null,
      role: 'student',
      age: 20,
      createdAt: 1,
      updatedAt: 1,
    }
  })
  afterEach(cleanup)

  it('renders the scoreboard privacy section with persisted switch state and display name', async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('Scoreboard & Privacy')).toBeInTheDocument()

    const switchControl = screen.getByLabelText(/show me on the public scoreboard/i)
    expect(switchControl).toBeInTheDocument()

    await waitFor(() => {
      expect(switchControl).toBeChecked()
      const nameInput = screen.getByLabelText(/scoreboard display name/i) as HTMLInputElement
      expect(nameInput.value).toBe('CustomScoreboardName')
    })
  })

  it('shows plain-language explanation for under-18 students', async () => {
    mockUserProfile = {
      uid: 'user-2',
      name: 'Minor Student',
      role: 'student',
      age: 16,
      createdAt: 1,
      updatedAt: 1,
    }

    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Students under 18 start hidden by default for privacy/i),
      ).toBeInTheDocument()
    })
  })

  it('lists the danger zone as its own step and links back to the profile', () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )
    const dangerZone = screen.getByRole('heading', { name: 'Danger zone' }).closest('section')
    expect(dangerZone).not.toBeNull()
    expect(within(dangerZone as HTMLElement).getByRole('link', { name: /open danger zone/i })).toHaveAttribute(
      'href',
      '/profile/settings/danger-zone',
    )
    expect(screen.getByRole('link', { name: /back to profile/i })).toHaveAttribute('href', '/profile')
  })

  it('reverts switch and shows error toast when callUpdateScoreboardOptIn fails', async () => {
    const user = userEvent.setup()
    const error = new Error('Scoreboard update failed.')
    ;(error as { status?: number }).status = 500
    vi.mocked(callUpdateScoreboardOptIn).mockRejectedValueOnce(error)

    render(
      <ToastProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ToastProvider>,
    )

    const switchControl = screen.getByLabelText(/show me on the public scoreboard/i)
    await waitFor(() => {
      expect(switchControl).toBeChecked()
    })

    await user.click(switchControl)

    await waitFor(() => {
      expect(switchControl).toBeChecked()
      expect(screen.getByText(/Could not update scoreboard privacy. Please try again later./i)).toBeInTheDocument()
    })
  })
})
