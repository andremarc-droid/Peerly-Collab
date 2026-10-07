import type { Timestamp } from 'firebase/firestore'
import type { LearningCanvasContent } from '../types'

/** What an invited person may do. The owner is implicit and always has full control. */
export type CollabRole = 'viewer' | 'editor'
export type CanvasAccess = 'owner' | CollabRole
export type PresenceState = 'active' | 'offline'

export interface MemberRecord {
  uid: string
  role: CollabRole
  displayName: string
  invitedBy: string
  grantedByToken: string
  joinedAt: Timestamp
  updatedAt: Timestamp
}

export interface InviteRecord {
  createdBy: string
  role: CollabRole
  active: boolean
  createdAt: Timestamp
  expiresAt: Timestamp | null
}

export interface InviteWithToken extends InviteRecord {
  token: string
}

/** What the UI shows for an invited person (timestamps already converted to milliseconds). */
export interface MemberView {
  uid: string
  role: CollabRole
  displayName: string
  joinedAtMs: number | null
}

export interface InviteView {
  token: string
  code: string
  role: CollabRole
  active: boolean
  createdBy: string
  createdAtMs: number | null
  /** Null means the link never expires. */
  expiresAtMs: number | null
}

/** One canvas somebody else shared with me, found through the members collection group. */
export interface SharedCanvasRef {
  classId: string
  canvasId: string
  role: CollabRole
}

export interface CursorPosition {
  x: number
  y: number
}

export interface PresenceRecord {
  uid: string
  name: string
  online: boolean
  cursor: CursorPosition | null
  /** Milliseconds since epoch of the last heartbeat, or null before the server has stamped it. */
  lastActiveMs: number | null
}

export type ActivityType = 'edit' | 'member'

export interface ActivityRecord {
  id: string
  actorId: string
  actorName: string
  type: ActivityType
  summary: string
  changes: string[]
  createdAtMs: number | null
}

export interface RemoteCursor {
  uid: string
  name: string
  x: number
  y: number
}

/** One row in the "who is here" list. */
export interface CollabPerson {
  uid: string
  name: string
  access: CanvasAccess
  state: PresenceState
  isYou: boolean
  lastSeenLabel: string
}

/** Everything the board needs from the collaboration layer. Built by useCanvasCollab. */
export interface CanvasCollabBinding {
  classId: string
  canvasId: string
  /**
   * False for a class member who only reads a published canvas without being invited: the board still
   * updates live, but there are no cursors and no activity log (the rules do not expose them).
   */
  social: boolean
  cursors: RemoteCursor[]
  publishCursor: (position: CursorPosition | null) => void
  recordEdit: (before: LearningCanvasContent, after: LearningCanvasContent) => void
}
