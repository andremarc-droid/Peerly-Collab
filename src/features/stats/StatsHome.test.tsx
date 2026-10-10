import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyStats } from './schemas'
import { localDayKey } from './streak'
import { StatsHome } from './StatsHome'

const mocks = vi.hoisted(() => ({ watch: vi.fn(), setGoal: vi.fn() }))
vi.mock('./services', () => ({ watchStats: mocks.watch, setDailyGoalXp: mocks.setGoal }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.setGoal.mockResolvedValue(undefined)
  mocks.watch.mockImplementation((_uid: string, onChange: (value: ReturnType<typeof emptyStats>) => void) => {
    onChange(emptyStats(localDayKey(new Date())))
    return () => undefined
  })
})
afterEach(cleanup)

describe('learning Home stats', () => {
  it('shows honest zero values for a new account', async () => {
    render(<StatsHome uid="new-user"/>)
    expect(await screen.findByText('0 days')).toBeTruthy()
    expect(screen.getByText('Level 1')).toBeTruthy()
    expect(screen.getByText('0 of 20 XP today')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('shows a streak and the calm goal-reached state', async () => {
    const stats = { ...emptyStats(localDayKey(new Date())), xp: 160, totalReviews: 12, currentStreak: 3, longestStreak: 3, today: { day: localDayKey(new Date()), xp: 20 } }
    mocks.watch.mockImplementation((_uid: string, onChange: (value: typeof stats) => void) => { onChange(stats); return () => undefined })
    render(<StatsHome uid="learner"/>)
    expect(await screen.findByText('3 days')).toBeTruthy()
    expect(screen.getByText('Daily goal reached. Nice work keeping your learning moving.')).toBeTruthy()
  })

  it('saves a changed daily goal through the stats service', async () => {
    render(<StatsHome uid="learner"/>)
    fireEvent.click(await screen.findByRole('button', { name: 'Change goal' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Daily goal' }), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save goal' }))
    await waitFor(() => expect(mocks.setGoal).toHaveBeenCalledWith('learner', 50))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a stats loading error', async () => {
    mocks.watch.mockImplementation((_uid: string, _onChange: unknown, onError: (error: Error) => void) => { onError(new Error('Access denied.')); return () => undefined })
    render(<StatsHome uid="learner"/>)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Access denied.')).toBeTruthy()
  })
})
