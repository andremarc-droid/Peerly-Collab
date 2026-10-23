import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFirestore } from 'firebase-admin/firestore'
import {
  joinStudyGroupHandler,
  leaveStudyGroupHandler,
  removeStudyGroupMemberHandler,
} from './studyGroups'

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
      increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
  }
})

describe('studyGroups Cloud Functions', () => {
  const mockedGetFirestore = vi.mocked(getFirestore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('joinStudyGroupHandler', () => {
    it('throws when unauthenticated', async () => {
      await expect(
        joinStudyGroupHandler({ auth: null, data: { inviteCode: 'ABC123' } } as any),
      ).rejects.toThrow('You must be signed in to join a study group.')
    })

    it('throws when group is full (max 50 members)', async () => {
      const mockGroupSnap = {
        exists: true,
        data: () => ({ name: 'Study Bio', memberCount: 50, maxMembers: 50 }),
      }
      const mockMemberSnap = { exists: false }

      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('members')) return mockMemberSnap
          return mockGroupSnap
        }),
        set: vi.fn(),
        update: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        collection: vi.fn().mockReturnValue({ doc: () => ({ id: 'act-1' }) }),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      await expect(
        joinStudyGroupHandler({
          auth: { uid: 'user-new', token: { name: 'New User' } },
          data: { groupId: 'group-1' },
        } as any),
      ).rejects.toThrow('This study group is full (maximum 50 members).')
    })

    it('returns alreadyMember if user is already a member', async () => {
      const mockGroupSnap = {
        exists: true,
        data: () => ({ name: 'Study Bio', memberCount: 10, maxMembers: 50 }),
      }
      const mockMemberSnap = { exists: true }

      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('members')) return mockMemberSnap
          return mockGroupSnap
        }),
        set: vi.fn(),
        update: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        collection: vi.fn().mockReturnValue({ doc: () => ({ id: 'act-1' }) }),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const result = await joinStudyGroupHandler({
        auth: { uid: 'user-old', token: { name: 'Old User' } },
        data: { groupId: 'group-1' },
      } as any)

      expect(result).toEqual({
        success: true,
        groupId: 'group-1',
        groupName: 'Study Bio',
        alreadyMember: true,
      })
      expect(transaction.set).not.toHaveBeenCalled()
    })

    it('successfully joins and increments member count', async () => {
      const mockGroupSnap = {
        exists: true,
        data: () => ({ name: 'Study Bio', memberCount: 5, maxMembers: 50 }),
      }
      const mockMemberSnap = { exists: false }

      const transaction = {
        get: vi.fn().mockImplementation(async (ref: any) => {
          if (ref.path.includes('members')) return mockMemberSnap
          return mockGroupSnap
        }),
        set: vi.fn(),
        update: vi.fn(),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        collection: vi.fn().mockReturnValue({ doc: () => ({ id: 'act-1' }) }),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      const result = await joinStudyGroupHandler({
        auth: { uid: 'user-2', token: { name: 'Member 2' } },
        data: { groupId: 'group-1' },
      } as any)

      expect(result).toEqual({ success: true, groupId: 'group-1', groupName: 'Study Bio' })
      expect(transaction.set).toHaveBeenCalledWith(
        { path: 'studyGroups/group-1/members/user-2' },
        expect.objectContaining({ uid: 'user-2', role: 'member' }),
      )
      expect(transaction.update).toHaveBeenCalledWith(
        { path: 'studyGroups/group-1' },
        expect.objectContaining({ memberCount: 'INCREMENT_1' }),
      )
    })
  })

  describe('leaveStudyGroupHandler', () => {
    it('prevents group owner from leaving', async () => {
      const mockGroupSnap = {
        exists: true,
        data: () => ({ ownerId: 'owner-uid' }),
      }

      const transaction = {
        get: vi.fn().mockResolvedValue(mockGroupSnap),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        collection: vi.fn().mockReturnValue({ doc: () => ({ id: 'act-1' }) }),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      await expect(
        leaveStudyGroupHandler({
          auth: { uid: 'owner-uid', token: {} },
          data: { groupId: 'group-1' },
        } as any),
      ).rejects.toThrow('Group owners cannot leave')
    })
  })

  describe('removeStudyGroupMemberHandler', () => {
    it('rejects removal if caller is not the owner', async () => {
      const mockGroupSnap = {
        exists: true,
        data: () => ({ ownerId: 'actual-owner' }),
      }

      const transaction = {
        get: vi.fn().mockResolvedValue(mockGroupSnap),
      }

      const mockDb = {
        doc: vi.fn().mockImplementation((path: string) => ({ path })),
        collection: vi.fn().mockReturnValue({ doc: () => ({ id: 'act-1' }) }),
        runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
      }
      mockedGetFirestore.mockReturnValue(mockDb as any)

      await expect(
        removeStudyGroupMemberHandler({
          auth: { uid: 'impostor', token: {} },
          data: { groupId: 'group-1', targetUid: 'user-3' },
        } as any),
      ).rejects.toThrow('Only the group owner can remove members.')
    })
  })
})
