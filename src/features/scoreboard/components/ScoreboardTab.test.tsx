import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoreboardTab } from './ScoreboardTab'
import * as services from '../services'

let mockAuthUser: any = { uid: 'u1', email: 'ada@example.com' }
let mockAuthProfile: any = { role: 'student', age: 20, displayName: 'Ada Lovelace' }

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    profile: mockAuthProfile,
  }),
}))

vi.mock('../services', () => ({
  listScoreboardEntries: vi.fn(),
  callEnsureScoreboardEntry: vi.fn(),
  recordScoreboardNoticeSeen: vi.fn(),
}))

describe('ScoreboardTab', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockAuthUser = { uid: 'u1', email: 'ada@example.com' }
    mockAuthProfile = { role: 'student', age: 20, displayName: 'Ada Lovelace', scoreboardNoticeSeenAt: 123456 }
  })

  it('renders loading state initially and then shows empty state if no entries', async () => {
    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [],
      userEntry: undefined,
    })
    vi.mocked(services.callEnsureScoreboardEntry).mockResolvedValue({ optIn: true, created: false })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    expect(screen.getByRole('tab', { name: /this week/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /all time/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('No scoreboard entries yet')).toBeInTheDocument()
    })
  })

  it('renders 0-point users normally and handles ties sharing rank', async () => {
    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [
        { uid: 'u2', displayName: 'Curie', points: 100, avatar: null, rank: 1 },
        { uid: 'u3', displayName: 'Franklin', points: 100, avatar: null, rank: 1 },
        { uid: 'u1', displayName: 'Ada Lovelace', points: 0, avatar: null, rank: 3 },
      ],
      userEntry: { uid: 'u1', displayName: 'Ada Lovelace', points: 0, avatar: null, rank: 3 },
    })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Your standing')).toBeInTheDocument()
    })

    // Standing banner shows rank #3 and 0 points
    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getAllByText('0')).toHaveLength(2)

    // Tied users both show '1st'
    const firstBadges = screen.getAllByText('1st')
    expect(firstBadges).toHaveLength(2)
    expect(screen.getAllByText('pts').length).toBe(3)
  })

  it('self-heals when user has no entry but is opted in', async () => {
    vi.mocked(services.listScoreboardEntries)
      .mockResolvedValueOnce({
        entries: [{ uid: 'u2', displayName: 'Curie', points: 100, avatar: null, rank: 1 }],
        userEntry: undefined,
      })
      .mockResolvedValueOnce({
        entries: [
          { uid: 'u2', displayName: 'Curie', points: 100, avatar: null, rank: 1 },
          { uid: 'u1', displayName: 'Ada Lovelace', points: 0, avatar: null, rank: 2 },
        ],
        userEntry: { uid: 'u1', displayName: 'Ada Lovelace', points: 0, avatar: null, rank: 2 },
      })

    vi.mocked(services.callEnsureScoreboardEntry).mockResolvedValueOnce({ optIn: true, created: true })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(services.callEnsureScoreboardEntry).toHaveBeenCalledTimes(1)
    })
  })

  it('shows honest hidden-state message when user is opted out', async () => {
    mockAuthProfile = { role: 'student', age: 16, scoreboardOptIn: undefined } // minor defaults to hidden

    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [{ uid: 'u2', displayName: 'Curie', points: 100, avatar: null, rank: 1 }],
      userEntry: undefined,
    })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText("You're hidden from the scoreboard")).toBeInTheDocument()
      expect(screen.getByText('Your study points and display name are private.')).toBeInTheDocument()
    })

    // Should NOT show '0 points' or call ensureScoreboardEntry
    expect(services.callEnsureScoreboardEntry).not.toHaveBeenCalled()
  })

  it('displays one-time visibility notice for adult users without dismissal and allows dismiss', async () => {
    mockAuthProfile = { role: 'student', age: 20, displayName: 'Ada', scoreboardNoticeSeenAt: null }

    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [],
      userEntry: undefined,
    })
    vi.mocked(services.callEnsureScoreboardEntry).mockResolvedValue({ optIn: true, created: false })
    vi.mocked(services.recordScoreboardNoticeSeen).mockResolvedValueOnce(undefined)

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText("You're on the public scoreboard")).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

    await waitFor(() => {
      expect(services.recordScoreboardNoticeSeen).toHaveBeenCalledWith('u1')
      expect(screen.queryByText("You're on the public scoreboard")).not.toBeInTheDocument()
    })
  })

  it('defaults to the All time period and allows switching to This week', async () => {
    vi.mocked(services.listScoreboardEntries).mockResolvedValue({
      entries: [],
      userEntry: undefined,
    })
    vi.mocked(services.callEnsureScoreboardEntry).mockResolvedValue({ optIn: true, created: false })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    const allTimeTab = screen.getByRole('tab', { name: /all time/i })
    const weeklyTab = screen.getByRole('tab', { name: /this week/i })

    expect(allTimeTab).toHaveAttribute('aria-selected', 'true')
    expect(weeklyTab).toHaveAttribute('aria-selected', 'false')
    expect(services.listScoreboardEntries).toHaveBeenCalledWith('allTime', 50, 'u1')

    fireEvent.click(weeklyTab)
    expect(weeklyTab).toHaveAttribute('aria-selected', 'true')
    expect(allTimeTab).toHaveAttribute('aria-selected', 'false')
    await waitFor(() => {
      expect(services.listScoreboardEntries).toHaveBeenCalledWith('weekly', 50, 'u1')
    })
  })
})

