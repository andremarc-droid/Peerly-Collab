import type { Timestamp } from 'firebase/firestore'

export type ClassStatus = 'active' | 'archived'
export type EnrollmentStatus = 'active' | 'pending' | 'blocked'
export type ClassAccent = 'pinstripe' | 'stripeFade' | 'solid'

export const CLASS_COLORS = [
  'navy',
  'ocean',
  'teal',
  'green',
  'amber',
  'rust',
  'crimson',
  'rose',
  'purple',
  'indigo',
  'slate',
] as const

export type ClassColor = (typeof CLASS_COLORS)[number]

export function resolveClassColor(value: unknown): ClassColor {
  if (typeof value === 'string' && (CLASS_COLORS as readonly string[]).includes(value)) {
    return value as ClassColor
  }
  return 'navy'
}

export const COLOR_OPTIONS: Array<{ value: ClassColor; label: string }> = [
  { value: 'navy', label: 'Navy' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'teal', label: 'Teal' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'rust', label: 'Rust' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'rose', label: 'Rose' },
  { value: 'purple', label: 'Purple' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'slate', label: 'Slate' },
]

export interface ClassRecord {
  ownerId: string
  ownerName: string
  name: string
  section: string
  subject: string
  description: string
  joinCode: string
  joinEnabled: boolean
  requireApproval: boolean
  status: ClassStatus
  accent: ClassAccent
  color?: ClassColor
  createdAt: Timestamp
  updatedAt: Timestamp
  codeRotatedAt: Timestamp
}

export interface ClassCodeRecord {
  classId: string
  ownerId: string
  className: string
  ownerName: string
  joinEnabled: boolean
  requireApproval: boolean
  archived: boolean
}

export interface EnrollmentRecord {
  classId: string
  ownerId: string
  uid: string
  studentName: string
  studentPhotoURL: string | null
  className: string
  status: EnrollmentStatus
  codeUsed: string
  joinedAt: Timestamp
  updatedAt: Timestamp
}

export type ClassWithId = ClassRecord & { id: string }
export type EnrollmentWithId = EnrollmentRecord & { id: string }

export interface NewClass {
  ownerId: string
  ownerName: string
  name: string
  section?: string
  subject?: string
  description?: string
  joinEnabled?: boolean
  requireApproval?: boolean
  accent?: ClassAccent
  color?: ClassColor
}

export type ClassPatch = Partial<Pick<ClassRecord, 'name' | 'section' | 'subject' | 'description' | 'accent' | 'color'>>

export type JoinOutcome =
  | { outcome: 'joined'; enrollment: EnrollmentWithId }
  | { outcome: 'pending_approval'; enrollment: EnrollmentWithId }
  | { outcome: 'request_already_pending'; enrollment: EnrollmentWithId }
  | { outcome: 'already_member'; enrollment: EnrollmentWithId }
  | { outcome: 'blocked'; enrollment: EnrollmentWithId }
  | { outcome: 'joining_paused' | 'class_archived' | 'instructor_cannot_join' | 'not_found' }

export interface JoinStudent {
  uid: string
  name: string
  photoURL: string | null
}
