import { MAX_GROUP_MEMBERS, MAX_GROUPS_JOINED } from './limits'

export type JoinFailure = 'invalid-code' | 'closed' | 'full' | 'already-member' | 'join-limit'
export function canLeaveGroup(role: 'owner' | 'member'): boolean { return role === 'member' }
export function resolveJoinEligibility(input: { codeMatches: boolean; joiningOpen: boolean; memberCount: number; isMember: boolean; joinedCount: number }): JoinFailure | null {
  if (!input.codeMatches) return 'invalid-code'
  if (input.isMember) return 'already-member'
  if (!input.joiningOpen) return 'closed'
  if (input.memberCount >= MAX_GROUP_MEMBERS) return 'full'
  if (input.joinedCount >= MAX_GROUPS_JOINED) return 'join-limit'
  return null
}
