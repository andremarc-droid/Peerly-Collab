import { ACTIVE_WINDOW_MS } from './constants'
import type {
  CanvasAccess,
  CollabPerson,
  CollabRole,
  PresenceRecord,
  PresenceState,
  RemoteCursor,
} from './types'

export function presenceStateOf(record: PresenceRecord | undefined, nowMs: number): PresenceState {
  if (!record || !record.online || record.lastActiveMs === null) return 'offline'
  return nowMs - record.lastActiveMs <= ACTIVE_WINDOW_MS ? 'active' : 'offline'
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function lastSeenLabel(record: PresenceRecord | undefined, nowMs: number): string {
  if (presenceStateOf(record, nowMs) === 'active') return 'Active now'
  if (!record || record.lastActiveMs === null) return 'Has not opened it yet'
  const minutes = Math.floor(Math.max(0, nowMs - record.lastActiveMs) / 60_000)
  if (minutes < 1) return 'Last seen just now'
  if (minutes < 60) return `Last seen ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last seen ${hours} h ago`
  return `Last seen ${Math.floor(hours / 24)} d ago`
}

interface BuildPeopleInput {
  ownerId: string
  members: Array<{ uid: string; displayName: string; role: CollabRole }>
  presence: ReadonlyMap<string, PresenceRecord>
  nowMs: number
  selfUid: string
  selfName: string
}

/** Owner first, then everyone invited. Active people sort ahead of offline ones. */
export function buildPeople({ ownerId, members, presence, nowMs, selfUid, selfName }: BuildPeopleInput): CollabPerson[] {
  const entries: Array<{ uid: string; name: string; access: CanvasAccess }> = [
    { uid: ownerId, name: ownerId === selfUid ? selfName : (presence.get(ownerId)?.name ?? 'Canvas owner'), access: 'owner' },
    ...members
      .filter((member) => member.uid !== ownerId)
      .map((member) => ({ uid: member.uid, name: member.displayName, access: member.role as CanvasAccess })),
  ]

  const people = entries.map((entry): CollabPerson => {
    const record = presence.get(entry.uid)
    const isYou = entry.uid === selfUid
    return {
      uid: entry.uid,
      name: entry.name,
      access: entry.access,
      isYou,
      state: isYou ? 'active' : presenceStateOf(record, nowMs),
      lastSeenLabel: isYou ? 'Active now' : lastSeenLabel(record, nowMs),
    }
  })

  const rank = (person: CollabPerson) => (person.isYou ? 0 : person.state === 'active' ? 1 : 2)
  return people.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** Other people who are active and have a known pointer position. */
export function visibleCursors(
  presence: ReadonlyMap<string, PresenceRecord>,
  nowMs: number,
  selfUid: string,
): RemoteCursor[] {
  const cursors: RemoteCursor[] = []
  for (const record of presence.values()) {
    if (record.uid === selfUid || !record.cursor) continue
    if (presenceStateOf(record, nowMs) !== 'active') continue
    cursors.push({ uid: record.uid, name: record.name, x: record.cursor.x, y: record.cursor.y })
  }
  return cursors
}
