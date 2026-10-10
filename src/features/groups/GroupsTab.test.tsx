import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GroupsTab } from './GroupsTab'

const mocks = vi.hoisted(() => ({
  createGroup: vi.fn(), joinGroup: vi.fn(), previewGroup: vi.fn(), leaveGroup: vi.fn(), removeGroupMember: vi.fn(), importGroupShare: vi.fn(), unshareGroupItem: vi.fn(),
  watchMyGroups: vi.fn((_uid: string, next: (groups: typeof mocks.groupList) => void) => { next(mocks.groupList); return () => undefined }),
  watchGroup: vi.fn((_id: string, next: (group: typeof mocks.group) => void) => { next(mocks.group); return () => undefined }),
  watchGroupMembers: vi.fn((_id: string, next: (members: typeof mocks.members) => void) => { next(mocks.members); return () => undefined }),
  watchGroupShares: vi.fn((_id: string, next: (shares: typeof mocks.shares) => void) => { next(mocks.shares); return () => undefined }),
  watchMyCanvasesAcrossClasses: vi.fn(() => () => undefined), listLessonPlans: vi.fn(async () => []),
  uid: 'learner', group: { id: 'g1', name: 'Biology', description: '', ownerId: 'owner', memberCount: 2, joinCode: 'ABCDEFG2', joiningOpen: true },
  groupList: [] as Array<{ id: string; name: string; description: string; ownerId: string; memberCount: number; joinCode: string; joiningOpen: boolean }>,
  members: [{ uid: 'owner', role: 'owner', displayName: 'Owner' }, { uid: 'learner', role: 'member', displayName: 'Learner' }],
  shares: [{ id: 's1', kind: 'deck', ownerId: 'owner', title: 'Cell deck', snapshotPath: 'groups/g1/sharedContent/s1' }],
}))
vi.mock('./services', async () => {
  const actual = await vi.importActual<typeof import('./services')>('./services')
  return { ...actual, createGroup: mocks.createGroup, joinGroup: mocks.joinGroup, previewGroup: mocks.previewGroup, leaveGroup: mocks.leaveGroup, removeGroupMember: mocks.removeGroupMember, importGroupShare: mocks.importGroupShare, unshareGroupItem: mocks.unshareGroupItem, watchMyGroups: mocks.watchMyGroups, watchGroup: mocks.watchGroup, watchGroupMembers: mocks.watchGroupMembers, watchGroupShares: mocks.watchGroupShares }
})
vi.mock('../learningCanvas/services', () => ({ watchMyCanvasesAcrossClasses: mocks.watchMyCanvasesAcrossClasses }))
vi.mock('../lessons/services', () => ({ listLessonPlans: mocks.listLessonPlans }))
vi.mock('../flashcards', () => ({ useFlashcardDecks: () => ({ decks: [] }) }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: mocks.uid, displayName: 'Learner' }, profile: { displayName: 'Learner' } }) }))
vi.mock('../../shared/ui/useToast', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

describe('GroupsTab', () => {
  afterEach(cleanup)
  beforeEach(() => { vi.clearAllMocks(); mocks.uid = 'learner'; mocks.groupList = []; mocks.group = { ...mocks.group, ownerId: 'owner' }; mocks.watchMyGroups.mockImplementation((_uid, next) => { next(mocks.groupList); return () => undefined }) })

  it('creates a group', async () => {
    mocks.createGroup.mockResolvedValue({ groupId: 'g1' })
    render(<GroupsTab />)
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Biology' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }))
    await waitFor(() => expect(mocks.createGroup).toHaveBeenCalledWith('Biology', '', 'Learner'))
  })

  it('previews and joins a valid invite', async () => {
    mocks.previewGroup.mockResolvedValue({ id: 'g1', name: 'Biology', description: '', memberCount: 2, joiningOpen: true })
    mocks.joinGroup.mockResolvedValue({ groupId: 'g1' })
    render(<GroupsTab />)
    fireEvent.change(screen.getByLabelText('8-character invite code'), { target: { value: 'ABCDEFG2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview group' }))
    expect(await screen.findByText('Biology')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Join group' }))
    await waitFor(() => expect(mocks.joinGroup).toHaveBeenCalledWith('ABCDEFG2', 'Learner'))
  })

  it.each([
    ['wrong code', 'That code was not found.'],
    ['full group', 'This group is full.'],
    ['already joined', 'You already joined this group.'],
  ])('shows a useful error for %s', async (_label, message) => {
    mocks.previewGroup.mockRejectedValue(new Error(message))
    render(<GroupsTab />)
    fireEvent.change(screen.getByLabelText('8-character invite code'), { target: { value: 'ABCDEFG2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview group' }))
    expect(await screen.findByText(message)).toBeTruthy()
  })

  it('shows members, imports snapshots, and lets a member leave', async () => {
    mocks.groupList = [mocks.group]
    mocks.importGroupShare.mockResolvedValue('copy-id')
    mocks.leaveGroup.mockResolvedValue({ success: true })
    render(<GroupsTab />)
    fireEvent.click(screen.getByRole('button', { name: /2 members/ }))
    expect(await screen.findByText(/Cell deck/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import as my copy' }))
    await waitFor(() => expect(mocks.importGroupShare).toHaveBeenCalledWith('learner', 'g1', 's1'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave group' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave group' })[1]!)
    await waitFor(() => expect(mocks.leaveGroup).toHaveBeenCalledWith('g1'))
  })

  it('lets the owner remove a member and remove a shared snapshot', async () => {
    mocks.uid = 'owner'
    mocks.groupList = [{ ...mocks.group, ownerId: 'owner' }]
    mocks.removeGroupMember.mockResolvedValue({ success: true })
    mocks.unshareGroupItem.mockResolvedValue({ success: true })
    render(<GroupsTab />)
    fireEvent.click(screen.getByRole('button', { name: /2 members/ }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Remove' }))[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }))
    await waitFor(() => expect(mocks.removeGroupMember).toHaveBeenCalledWith('g1', 'learner'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]!)
    await waitFor(() => expect(mocks.unshareGroupItem).toHaveBeenCalledWith('g1', 's1'))
  })
})
