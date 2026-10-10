import { describe, expect, it } from 'vitest'
import { canLeaveGroup, resolveJoinEligibility } from './joinLogic'

describe('group join eligibility', () => {
  const base = { codeMatches: true, joiningOpen: true, memberCount: 3, isMember: false, joinedCount: 2 }
  it('allows a valid join under the cap', () => expect(resolveJoinEligibility(base)).toBeNull())
  it.each([
    [{ ...base, codeMatches: false }, 'invalid-code'],
    [{ ...base, joiningOpen: false }, 'closed'],
    [{ ...base, memberCount: 30 }, 'full'],
    [{ ...base, isMember: true }, 'already-member'],
    [{ ...base, joinedCount: 20 }, 'join-limit'],
  ] as const)('rejects %s', (input, expected) => expect(resolveJoinEligibility(input)).toBe(expected))
  it('allows members to leave but requires the owner to delete the group', () => {
    expect(canLeaveGroup('member')).toBe(true)
    expect(canLeaveGroup('owner')).toBe(false)
  })
})
