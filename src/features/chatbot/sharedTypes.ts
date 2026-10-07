import type { ChatThread } from './types'

export type TutorShareRole = 'viewer' | 'editor'
export type TutorAccessRole = TutorShareRole | 'owner'

export interface TutorShareMember {
  uid: string
  role: TutorShareRole
  displayName: string
}

export interface TutorShareInvite {
  token: string
  code: string
  role: TutorShareRole
  active: boolean
  expiresAtMs: number | null
  createdAtMs: number | null
}

export interface TutorActivity {
  id: string
  actorId: string
  actorName: string
  summary: string
  createdAtMs: number | null
}

export interface SharedTutorThread extends ChatThread {
  sharedRole: TutorAccessRole
  ownerId: string
}

export interface SharedTutorRef {
  threadId: string
  role: TutorAccessRole
  ownerId: string
}
