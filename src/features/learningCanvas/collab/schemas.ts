import { Timestamp } from 'firebase/firestore'
import {
  MAX_ACTIVITY_CHANGES,
  MAX_ACTIVITY_LINE,
  MAX_ACTIVITY_SUMMARY,
  MAX_DISPLAY_NAME,
} from './constants'
import type {
  ActivityRecord,
  CollabRole,
  InviteView,
  MemberView,
  PresenceRecord,
} from './types'

/*
 * Everything read from the collab collections is treated as untrusted. Parsers return null for a
 * malformed document so one bad record never breaks the whole list.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toMillis(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

export function isCollabRole(value: unknown): value is CollabRole {
  return value === 'viewer' || value === 'editor'
}

export function parseMember(id: string, data: unknown): MemberView | null {
  if (!isRecord(data) || !isCollabRole(data.role)) return null
  const displayName = cleanText(data.displayName, MAX_DISPLAY_NAME)
  if (!displayName) return null
  return { uid: id, role: data.role, displayName, joinedAtMs: toMillis(data.joinedAt) }
}

export function parseInvite(token: string, data: unknown): InviteView | null {
  if (!isRecord(data) || !isCollabRole(data.role) || typeof data.active !== 'boolean') return null
  if (typeof data.createdBy !== 'string') return null
  return {
    token,
    role: data.role,
    active: data.active,
    createdBy: data.createdBy,
    createdAtMs: toMillis(data.createdAt),
    expiresAtMs: toMillis(data.expiresAt),
  }
}

function parseCursor(value: unknown): PresenceRecord['cursor'] {
  if (!isRecord(value)) return null
  const { x, y } = value
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null
}

/** `lastActive` is null for a moment after a local write, before the server has stamped it. */
export function parsePresence(id: string, data: unknown): PresenceRecord | null {
  if (!isRecord(data)) return null
  const name = cleanText(data.name, MAX_DISPLAY_NAME)
  if (!name) return null
  return {
    uid: id,
    name,
    online: data.online === true,
    cursor: parseCursor(data.cursor),
    lastActiveMs: toMillis(data.lastActive),
  }
}

export function parseActivity(id: string, data: unknown): ActivityRecord | null {
  if (!isRecord(data)) return null
  const actorName = cleanText(data.actorName, MAX_DISPLAY_NAME)
  const summary = cleanText(data.summary, MAX_ACTIVITY_SUMMARY)
  if (!actorName || !summary || typeof data.actorId !== 'string') return null
  if (data.type !== 'edit' && data.type !== 'member') return null
  const changes = Array.isArray(data.changes)
    ? data.changes
        .map((line) => cleanText(line, MAX_ACTIVITY_LINE))
        .filter((line): line is string => line !== null)
        .slice(0, MAX_ACTIVITY_CHANGES)
    : []
  return {
    id,
    actorId: data.actorId,
    actorName,
    type: data.type,
    summary,
    changes,
    createdAtMs: toMillis(data.createdAt),
  }
}
