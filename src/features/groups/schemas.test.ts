import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { parseGroupMember, parseGroupShare, parseStudyGroup, validateGroupCreate, validateGroupMemberLimit } from './schemas'

const stamp = Timestamp.fromMillis(1)
const group = { name: 'Study friends', description: '', ownerId: 'owner', memberCount: 1, createdAt: stamp, updatedAt: stamp, joinCode: 'ABCD2345', joiningOpen: true }
describe('study group schemas', () => {
  it('parses valid groups, members and shares', () => {
    expect(parseStudyGroup(group, 'g1').id).toBe('g1')
    expect(parseGroupMember({ role: 'owner', displayName: 'Alex', joinedAt: stamp }, 'owner').uid).toBe('owner')
    expect(parseGroupShare({ kind: 'deck', ownerId: 'owner', title: 'Deck', snapshotPath: 'groups/g1/sharedContent/s1', sharedAt: stamp }).kind).toBe('deck')
  })
  it('rejects malformed timestamps, extra fields, bad codes and over-length values', () => {
    expect(() => parseStudyGroup({ ...group, extra: true })).toThrow(/unexpected fields/)
    expect(() => parseStudyGroup({ ...group, joinCode: 'bad' })).toThrow(/invite code/)
    expect(() => parseStudyGroup({ ...group, name: 'x'.repeat(81) })).toThrow(/Group name/)
    expect(() => parseGroupMember({ role: 'member', displayName: 'x'.repeat(61), joinedAt: stamp })).toThrow(/Display name/)
    expect(() => parseGroupShare({ kind: 'other', ownerId: 'u', title: 'x', snapshotPath: 'groups/g/sharedContent/s', sharedAt: stamp })).toThrow(/type/)
  })
  it('validates create lengths and member caps', () => {
    expect(validateGroupCreate(' Biology ', '').name).toBe('Biology')
    expect(() => validateGroupCreate('x'.repeat(81), '')).toThrow()
    expect(() => validateGroupMemberLimit(31)).toThrow(/30/)
  })
})
