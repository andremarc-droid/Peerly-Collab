import { Timestamp } from 'firebase/firestore'
import { isValidJoinCode } from './joinCode'
import {
  CLASS_COLORS,
  resolveClassColor,
  type ClassAccent,
  type ClassCodeRecord,
  type ClassColor,
  type ClassPatch,
  type ClassRecord,
  type ClassStatus,
  type EnrollmentRecord,
  type EnrollmentStatus,
} from './types'

export class ClassValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ClassValidationError' }
}

type Data = Record<string, unknown>
function data(value: unknown, label: string): Data {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ClassValidationError(`${label} must be an object`)
  return value as Data
}
function exactKeys(value: Data, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new ClassValidationError(`${label} contains unsupported fields`)
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new ClassValidationError(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`)
  return value
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ClassValidationError(`${label} must be a boolean`)
  return value
}
function timestamp(value: unknown, label: string): Timestamp {
  if (!(value instanceof Timestamp)) throw new ClassValidationError(`${label} must be a Firestore timestamp`)
  return value
}
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new ClassValidationError(`${label} is invalid`)
  return value as T
}

const classKeys = ['ownerId', 'ownerName', 'name', 'section', 'subject', 'description', 'joinCode', 'joinEnabled', 'requireApproval', 'status', 'accent', 'color', 'createdAt', 'updatedAt', 'codeRotatedAt']
const codeKeys = ['classId', 'ownerId', 'className', 'ownerName', 'joinEnabled', 'requireApproval', 'archived']
const enrollmentKeys = ['classId', 'ownerId', 'uid', 'studentName', 'studentPhotoURL', 'className', 'status', 'codeUsed', 'joinedAt', 'updatedAt']

export function parseClass(value: unknown): ClassRecord {
  const item = data(value, 'class')
  exactKeys(item, classKeys, 'class')
  const joinCode = text(item.joinCode, 'joinCode')
  if (!isValidJoinCode(joinCode)) throw new ClassValidationError('joinCode must contain six valid characters')
  const accent = oneOf(item.accent, ['pinstripe', 'stripeFade', 'solid'] as const, 'accent')
  const color = resolveClassColor(item.color)
  return {
    ownerId: text(item.ownerId, 'ownerId'), ownerName: text(item.ownerName, 'ownerName'), name: text(item.name, 'name'),
    section: text(item.section, 'section', true), subject: text(item.subject, 'subject', true), description: text(item.description, 'description', true),
    joinCode, joinEnabled: bool(item.joinEnabled, 'joinEnabled'), requireApproval: bool(item.requireApproval, 'requireApproval'),
    status: oneOf(item.status, ['active', 'archived'] as const satisfies readonly ClassStatus[], 'status'), accent, color,
    createdAt: timestamp(item.createdAt, 'createdAt'), updatedAt: timestamp(item.updatedAt, 'updatedAt'), codeRotatedAt: timestamp(item.codeRotatedAt, 'codeRotatedAt'),
  }
}

export function parseClassCode(value: unknown): ClassCodeRecord {
  const item = data(value, 'classCode')
  exactKeys(item, codeKeys, 'classCode')
  return {
    classId: text(item.classId, 'classCode.classId'), ownerId: text(item.ownerId, 'classCode.ownerId'),
    className: text(item.className, 'classCode.className'), ownerName: text(item.ownerName, 'classCode.ownerName'),
    joinEnabled: bool(item.joinEnabled, 'classCode.joinEnabled'), requireApproval: bool(item.requireApproval, 'classCode.requireApproval'), archived: bool(item.archived, 'classCode.archived'),
  }
}

export function parseEnrollment(value: unknown): EnrollmentRecord {
  const item = data(value, 'enrollment')
  exactKeys(item, enrollmentKeys, 'enrollment')
  const photo = item.studentPhotoURL
  if (photo !== null && (typeof photo !== 'string' || photo.length > 2000)) throw new ClassValidationError('studentPhotoURL must be a string under 2000 characters or null')
  const studentName = text(item.studentName, 'studentName')
  if (studentName.length > 120) throw new ClassValidationError('studentName must not exceed 120 characters')
  const codeUsed = text(item.codeUsed, 'codeUsed')
  if (!isValidJoinCode(codeUsed)) throw new ClassValidationError('codeUsed must be a valid join code')
  return {
    classId: text(item.classId, 'classId'), ownerId: text(item.ownerId, 'ownerId'), uid: text(item.uid, 'uid'),
    studentName, studentPhotoURL: photo,
    className: text(item.className, 'className'), status: oneOf(item.status, ['active', 'pending', 'blocked'] as const satisfies readonly EnrollmentStatus[], 'status'),
    codeUsed, joinedAt: timestamp(item.joinedAt, 'joinedAt'), updatedAt: timestamp(item.updatedAt, 'updatedAt'),
  }
}

export function validateClassPatch(value: unknown): ClassPatch {
  const item = data(value, 'class patch')
  const allowed = ['name', 'section', 'subject', 'description', 'accent', 'color']
  exactKeys(item, allowed, 'class patch')
  const patch: ClassPatch = {}
  if ('name' in item) patch.name = text(item.name, 'name')
  if ('section' in item) patch.section = text(item.section, 'section', true)
  if ('subject' in item) patch.subject = text(item.subject, 'subject', true)
  if ('description' in item) patch.description = text(item.description, 'description', true)
  if ('accent' in item) patch.accent = oneOf(item.accent, ['pinstripe', 'stripeFade', 'solid'] as const, 'accent') as ClassAccent
  if ('color' in item) patch.color = oneOf(item.color, CLASS_COLORS, 'color') as ClassColor
  return patch
}
