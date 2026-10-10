import { Timestamp } from 'firebase/firestore'
import { MAX_GROUP_DESCRIPTION, MAX_GROUP_MEMBER_NAME, MAX_GROUP_NAME, MAX_GROUP_MEMBERS, MAX_GROUP_SHARE_TITLE } from './limits'
import type { GroupShareKind, StudyGroupMemberRecord, StudyGroupRecord } from './types'

export class GroupValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'GroupValidationError' }
}
type RecordValue = Record<string, unknown>
function record(value: unknown, label: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GroupValidationError(`${label} must be an object.`)
  return value as RecordValue
}
function exact(value: RecordValue, keys: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) throw new GroupValidationError(`${label} has missing or unexpected fields.`)
}
function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new GroupValidationError(`${label} must be between ${min} and ${max} characters.`)
  return value.trim()
}
function timestamp(value: unknown, label: string): Timestamp {
  if (value instanceof Timestamp) return value
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (typeof value === 'object' && value !== null && 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
    const item = value as { seconds: number; nanoseconds?: number }
    return new Timestamp(item.seconds, item.nanoseconds ?? 0)
  }
  throw new GroupValidationError(`${label} must be a timestamp.`)
}
export function parseStudyGroup(value: unknown, id?: string): StudyGroupRecord & { id?: string } {
  const data = record(value, 'Group')
  exact(data, ['name', 'description', 'ownerId', 'memberCount', 'createdAt', 'updatedAt', 'joinCode', 'joiningOpen'], 'Group')
  if (!Number.isInteger(data.memberCount) || (data.memberCount as number) < 1 || (data.memberCount as number) > MAX_GROUP_MEMBERS) throw new GroupValidationError('Group member count is invalid.')
  if (typeof data.joiningOpen !== 'boolean') throw new GroupValidationError('Group joining state is invalid.')
  if (typeof data.joinCode !== 'string' || !/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(data.joinCode)) throw new GroupValidationError('Group invite code is invalid.')
  return {
    ...(id ? { id } : {}), name: text(data.name, 'Group name', 1, MAX_GROUP_NAME),
    description: text(data.description, 'Group description', 0, MAX_GROUP_DESCRIPTION),
    ownerId: text(data.ownerId, 'Group owner', 1, 128), memberCount: data.memberCount as number,
    createdAt: timestamp(data.createdAt, 'Group createdAt'), updatedAt: timestamp(data.updatedAt, 'Group updatedAt'),
    joinCode: data.joinCode, joiningOpen: data.joiningOpen,
  }
}
export function parseGroupMember(value: unknown, uid?: string): StudyGroupMemberRecord & { uid?: string } {
  const data = record(value, 'Group member')
  exact(data, ['role', 'displayName', 'joinedAt'], 'Group member')
  if (data.role !== 'owner' && data.role !== 'member') throw new GroupValidationError('Group member role is invalid.')
  return { ...(uid ? { uid } : {}), role: data.role, displayName: text(data.displayName, 'Display name', 1, MAX_GROUP_MEMBER_NAME), joinedAt: timestamp(data.joinedAt, 'Member joinedAt') }
}
export function parseGroupShare(value: unknown, id?: string) {
  const data = record(value, 'Group share')
  exact(data, ['kind', 'ownerId', 'title', 'snapshotPath', 'sharedAt'], 'Group share')
  if (!['lessonPlan', 'deck', 'canvas'].includes(data.kind as string)) throw new GroupValidationError('Shared content type is invalid.')
  if (typeof data.snapshotPath !== 'string' || !/^groups\/[A-Za-z0-9_-]{1,128}\/sharedContent\/[A-Za-z0-9_-]{1,128}$/.test(data.snapshotPath)) throw new GroupValidationError('Snapshot path is invalid.')
  return { ...(id ? { id } : {}), kind: data.kind as GroupShareKind, ownerId: text(data.ownerId, 'Share owner', 1, 128), title: text(data.title, 'Share title', 1, MAX_GROUP_SHARE_TITLE), snapshotPath: data.snapshotPath, sharedAt: timestamp(data.sharedAt, 'Share time') }
}
export function validateGroupCreate(name: string, description: string): { name: string; description: string } {
  return { name: text(name, 'Group name', 1, MAX_GROUP_NAME), description: text(description, 'Group description', 0, MAX_GROUP_DESCRIPTION) }
}
export function validateGroupMemberLimit(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_GROUP_MEMBERS) throw new GroupValidationError(`A group can have at most ${MAX_GROUP_MEMBERS} members.`)
}
