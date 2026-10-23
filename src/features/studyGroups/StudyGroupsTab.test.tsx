import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudyGroupsTab } from './components/StudyGroupsTab'
import * as services from './services'
import type { StudyGroup } from './types'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1', displayName: 'Student One' } }),
}))

vi.mock('../../shared/ui/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const mockGroups: StudyGroup[] = [
  {
    id: 'grp-1',
    name: 'Calculus Explorers',
    description: 'Derivatives and integrals practice',
    privacy: 'public',
    ownerId: 'student-1',
    ownerDisplayName: 'Student One',
    inviteCode: '7K4MNP',
    memberCount: 3,
    maxMembers: 50,
    createdAt: {} as any,
    updatedAt: {} as any,
  },
]

describe('StudyGroupsTab', () => {
  beforeEach(() => {
    vi.spyOn(services, 'listMyStudyGroups').mockResolvedValue(mockGroups)
    vi.spyOn(services, 'listPublicStudyGroups').mockResolvedValue(mockGroups)
  })

  afterEach(cleanup)

  it('renders study groups list with heading and group card', async () => {
    render(<StudyGroupsTab />)
    expect(await screen.findByText('Study Groups')).toBeTruthy()
    expect(await screen.findByText('Calculus Explorers')).toBeTruthy()
    expect(screen.getByText('3 / 50')).toBeTruthy()
  })

  it('opens create study group dialog when create button is clicked', async () => {
    render(<StudyGroupsTab />)
    const createBtn = await screen.findByRole('button', { name: /create study group/i })
    fireEvent.click(createBtn)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText(/group name/i)).toBeTruthy()
  })

  it('opens join with code dialog when join button is clicked', async () => {
    render(<StudyGroupsTab />)
    const joinBtn = await screen.findByRole('button', { name: /join with code/i })
    fireEvent.click(joinBtn)

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText(/invite code/i)).toBeTruthy()
  })
})
