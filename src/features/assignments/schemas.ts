import { Timestamp } from 'firebase/firestore'
import {
  MAX_ATTACHMENTS, MAX_FEEDBACK_LENGTH, MAX_INSTRUCTIONS_LENGTH, MAX_POINTS, MAX_TITLE_LENGTH, MAX_TURN_IN_FILES,
  type AssignmentRecord, type DriveFile, type TurnInRecord,
} from './types'

const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com']
const DRIVE_KINDS = ['file', 'doc', 'sheet', 'slides']

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}.`)
  return value as Record<string, unknown>
}

/** True only for https links on Google's Drive or Docs hosts. Used before any stored URL becomes an href. */
export function isDriveUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && DRIVE_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}

export function parseDriveFile(value: unknown): DriveFile {
  const v = asRecord(value, 'Drive file')
  if (typeof v.fileId !== 'string' || !FILE_ID.test(v.fileId)) throw new Error('Invalid Drive file id.')
  if (typeof v.name !== 'string' || v.name.length < 1 || v.name.length > 200) throw new Error('Invalid Drive file name.')
  if (typeof v.mimeType !== 'string' || v.mimeType.length > 150) throw new Error('Invalid Drive file type.')
  if (typeof v.kind !== 'string' || !DRIVE_KINDS.includes(v.kind)) throw new Error('Invalid Drive file kind.')
  if (!isDriveUrl(v.url)) throw new Error('Invalid Drive file link.')
  return { fileId: v.fileId, name: v.name, mimeType: v.mimeType, kind: v.kind as DriveFile['kind'], url: v.url }
}

export function parseDriveFiles(value: unknown, max: number): DriveFile[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Use at most ${max} files.`)
  const files = value.map(parseDriveFile)
  if (new Set(files.map((file) => file.fileId)).size !== files.length) throw new Error('Each file can only be added once.')
  return files
}

const isTimestamp = (value: unknown): value is Timestamp => value instanceof Timestamp

/** Why an assignment cannot be published yet, or null when it is ready. */
export function getPublishIssue(value: Pick<AssignmentRecord, 'title' | 'instructions' | 'attachments' | 'acceptsTurnIn' | 'collectorEmail'>): string | null {
  if (!value.title.trim()) return 'Add a title before publishing.'
  if (!value.instructions.trim() && value.attachments.length === 0) return 'Add instructions or at least one file before publishing.'
  if (value.acceptsTurnIn && !value.collectorEmail) return 'Connect the Google account that should receive student work, or turn off turn-in.'
  return null
}

export function parseAssignment(value: unknown): AssignmentRecord {
  const v = asRecord(value, 'assignment')
  if (typeof v.ownerId !== 'string' || !v.ownerId) throw new Error('Invalid assignment owner.')
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > MAX_TITLE_LENGTH) throw new Error(`The title must be 1–${MAX_TITLE_LENGTH} characters.`)
  if (typeof v.instructions !== 'string' || v.instructions.length > MAX_INSTRUCTIONS_LENGTH) throw new Error(`Instructions can be at most ${MAX_INSTRUCTIONS_LENGTH} characters.`)
  if (v.status !== 'draft' && v.status !== 'published') throw new Error('Invalid assignment status.')
  if (v.dueAt !== null && !isTimestamp(v.dueAt)) throw new Error('Invalid due date.')
  if (v.points !== null && (typeof v.points !== 'number' || !Number.isInteger(v.points) || v.points < 0 || v.points > MAX_POINTS)) throw new Error(`Points must be a whole number from 0 to ${MAX_POINTS}.`)
  if (typeof v.acceptsTurnIn !== 'boolean') throw new Error('Invalid turn-in setting.')
  if (v.collectorEmail !== null && (typeof v.collectorEmail !== 'string' || v.collectorEmail.length > 254 || !EMAIL.test(v.collectorEmail))) throw new Error('Invalid collection email.')
  const attachments = parseDriveFiles(v.attachments, MAX_ATTACHMENTS)
  if (!isTimestamp(v.createdAt) || !isTimestamp(v.updatedAt)) throw new Error('Invalid assignment timestamps.')
  if (v.publishedAt !== null && !isTimestamp(v.publishedAt)) throw new Error('Invalid published time.')
  if (v.status === 'published' && v.acceptsTurnIn && v.collectorEmail === null) throw new Error('Published assignments that take turn-ins need a collection account.')
  return {
    ownerId: v.ownerId, title: v.title, instructions: v.instructions, status: v.status, dueAt: v.dueAt, points: v.points,
    acceptsTurnIn: v.acceptsTurnIn, collectorEmail: v.collectorEmail, attachments,
    createdAt: v.createdAt, updatedAt: v.updatedAt, publishedAt: v.publishedAt,
  }
}

export function parseTurnIn(value: unknown): TurnInRecord {
  const v = asRecord(value, 'turn-in')
  if (typeof v.studentId !== 'string' || !v.studentId) throw new Error('Invalid student.')
  if (typeof v.studentName !== 'string' || v.studentName.length < 1 || v.studentName.length > 120) throw new Error('Invalid student name.')
  if (typeof v.classId !== 'string' || !v.classId) throw new Error('Invalid class.')
  const files = parseDriveFiles(v.files, MAX_TURN_IN_FILES)
  if (files.length < 1) throw new Error('A turn-in needs at least one file.')
  if (!isTimestamp(v.turnedInAt)) throw new Error('Invalid turn-in time.')
  // Grading fields are absent until the instructor grades the work, so missing means "not graded".
  const grade = v.grade ?? null
  if (grade !== null && (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 0 || grade > MAX_POINTS)) throw new Error('Invalid grade.')
  const feedback = v.feedback ?? ''
  if (typeof feedback !== 'string' || feedback.length > MAX_FEEDBACK_LENGTH) throw new Error('Invalid feedback.')
  const gradedAt = v.gradedAt ?? null
  if (gradedAt !== null && !isTimestamp(gradedAt)) throw new Error('Invalid grading time.')
  return { studentId: v.studentId, studentName: v.studentName, classId: v.classId, files, turnedInAt: v.turnedInAt, grade, feedback, gradedAt }
}

export interface GradeInput {
  grade: number | null
  feedback: string
}

/**
 * Checks what an instructor typed before it is saved. A grade is a whole number from 0 up to the assignment's points,
 * and only assignments that have points can be given a grade (feedback alone is always fine).
 */
export function parseGradeInput(grade: unknown, feedback: unknown, points: number | null): GradeInput {
  const text = typeof feedback === 'string' ? feedback.trim() : ''
  if (text.length > MAX_FEEDBACK_LENGTH) throw new Error(`Feedback can be at most ${MAX_FEEDBACK_LENGTH} characters.`)
  if (grade === null || grade === undefined) return { grade: null, feedback: text }
  if (points === null) throw new Error('This assignment has no points. Add points to the assignment before giving a grade.')
  if (typeof grade !== 'number' || !Number.isInteger(grade) || grade < 0) throw new Error('Enter a whole number of points, 0 or more.')
  if (grade > points) throw new Error(`The grade can be at most ${points}, the points for this assignment.`)
  return { grade, feedback: text }
}
