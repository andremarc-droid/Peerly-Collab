import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoreboardTab } from './ScoreboardTab'
import * as services from '../services'

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'ada@example.com' },
  }),
}))

vi.mock('../services', () => ({
  listScoreboardEntries: vi.fn(),
}))

describe('ScoreboardTab', () => {
  afterEach(cleanup)
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially and then shows empty state if no entries', async () => {
    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [],
      userEntry: undefined,
    })

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

  it('renders top learner rankings and user standing banner', async () => {
    vi.mocked(services.listScoreboardEntries).mockResolvedValueOnce({
      entries: [
        { uid: 'u2', displayName: 'Curie', points: 200, avatar: null, rank: 1 },
        { uid: 'u1', displayName: 'Ada Lovelace', points: 150, avatar: null, rank: 2 },
      ],
      userEntry: { uid: 'u1', displayName: 'Ada Lovelace', points: 150, avatar: null, rank: 2 },
    })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Your standing')).toBeInTheDocument()
    })

    // Standing banner
    expect(screen.getByText('#2')).toBeInTheDocument()
    expect(screen.getAllByText('150').length).toBeGreaterThan(0)

    // Table / list
    expect(screen.getByText('Curie')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
  })

  it('switches between weekly and all-time periods', async () => {
    vi.mocked(services.listScoreboardEntries)
      .mockResolvedValueOnce({
        entries: [{ uid: 'u1', displayName: 'Ada', points: 50, avatar: null, rank: 1 }],
        userEntry: { uid: 'u1', displayName: 'Ada', points: 50, avatar: null, rank: 1 },
      })
      .mockResolvedValueOnce({
        entries: [{ uid: 'u1', displayName: 'Ada', points: 500, avatar: null, rank: 1 }],
        userEntry: { uid: 'u1', displayName: 'Ada', points: 500, avatar: null, rank: 1 },
      })

    render(
      <MemoryRouter>
        <ScoreboardTab />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getAllByText('50').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: /all time/i }))

    await waitFor(() => {
      expect(services.listScoreboardEntries).toHaveBeenCalledWith('allTime', 50, 'u1')
      expect(screen.getAllByText('500').length).toBeGreaterThan(0)
    })
  })
})
