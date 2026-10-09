import type { Timestamp } from 'firebase/firestore'
import type { DriveKind } from '../modules/types'

export const MAX_ATTACHMENTS = 10
export const MAX_TURN_IN_FILES = 5
export const MAX_TITLE_LENGTH = 120
export const MAX_INSTRUCTIONS_LENGTH = 5000
export const MAX_POINTS = 1000

export type AssignmentStatus = 'draft' | 'published'

/**
 * Metadata about one Google Drive file. Only this reference is stored in Firestore;
 * the file itself always stays in its owner's Drive, so there is no upload size limit.
 */
export interface DriveFile {
  fileId: string
  name: string
  mimeType: string
  kind: DriveKind
  url: string
}

export interface AssignmentRecord {
  ownerId: string
  title: string
  instructions: string
  status: AssignmentStatus
  dueAt: Timestamp | null
  points: number | null
  /** When false the assignment is read-only material: students see it but have nothing to turn in. */
  acceptsTurnIn: boolean
  /** Google account email that students share their files with. Readable by active class members. */
  collectorEmail: string | null
  attachments: DriveFile[]
  createdAt: Timestamp
  updatedAt: Timestamp
  publishedAt: Timestamp | null
}

export interface AssignmentWithId extends AssignmentRecord {
  id: string
  classId: string
}

export type AssignmentPatch = Partial<
  Pick<AssignmentRecord, 'title' | 'instructions' | 'dueAt' | 'points' | 'acceptsTurnIn' | 'collectorEmail' | 'attachments'>
>

/** One document per student per assignment, stored at assignments/{assignmentId}/turnIns/{studentId}. */
export interface TurnInRecord {
  studentId: string
  studentName: string
  classId: string
  files: DriveFile[]
  turnedInAt: Timestamp
}

export interface TurnInWithId extends TurnInRecord {
  assignmentId: string
}

export type TurnInState = 'not_required' | 'assigned' | 'missing' | 'turned_in' | 'turned_in_late'
