import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, Timestamp, where, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { checkJoinLookupCooldown, clearJoinLookupFailures, isValidJoinCode, normalizeJoinCode, recordJoinLookupFailure } from '../joinCode'
import { parseClassCode, parseEnrollment } from '../schemas'
import type { ClassCodeRecord, EnrollmentWithId, JoinOutcome, JoinStudent } from '../types'
import { enrollmentRef } from './paths'

export class JoinLookupCooldownError extends Error {
  constructor() { super('Too many unsuccessful code lookups. Please wait a few minutes before trying again.'); this.name = 'JoinLookupCooldownError' }
}

function isPermissionDenied(reason: unknown): boolean {
  return typeof reason === 'object' && reason !== null && 'code' in reason && (reason as { code: unknown }).code === 'permission-denied'
}

async function existingOutcome(ref: ReturnType<typeof enrollmentRef>): Promise<JoinOutcome | null> {
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  const enrollment = { ...parseEnrollment(snapshot.data()), id: snapshot.id }
  if (enrollment.status === 'blocked') return { outcome: 'blocked', enrollment }
  if (enrollment.status === 'pending') return { outcome: 'pending_approval', enrollment }
  return { outcome: 'already_member', enrollment }
}

export async function lookupClassByCode(code: string, requesterUid: string, db: Firestore = firestore): Promise<ClassCodeRecord | null> {
  const throttle = checkJoinLookupCooldown(requesterUid)
  if (!throttle.allowed) throw new JoinLookupCooldownError()
  const normalized = normalizeJoinCode(code)
  if (!isValidJoinCode(normalized)) {
    recordJoinLookupFailure(requesterUid)
    return null
  }
  const snapshot = await getDoc(doc(db, 'classCodes', normalized))
  if (!snapshot.exists()) {
    recordJoinLookupFailure(requesterUid)
    return null
  }
  clearJoinLookupFailures(requesterUid)
  return parseClassCode(snapshot.data())
}

export async function joinClass(code: string, student: JoinStudent, db: Firestore = firestore): Promise<JoinOutcome> {
  const userSnapshot = await getDoc(doc(db, 'users', student.uid))
  if (userSnapshot.data()?.role === 'instructor') return { outcome: 'instructor_cannot_join' }
  if (userSnapshot.data()?.role !== 'student') return { outcome: 'instructor_cannot_join' }
  const normalized = normalizeJoinCode(code)
  const preview = await lookupClassByCode(normalized, student.uid, db)
  if (!preview) return { outcome: 'not_found' }
  if (preview.archived) return { outcome: 'class_archived' }
  if (!preview.joinEnabled) return { outcome: 'joining_paused' }
  const ref = enrollmentRef(db, preview.classId, student.uid)
  const existing = await existingOutcome(ref)
  if (existing) return existing
  const now = Timestamp.now()
  const enrollment = parseEnrollment({
    classId: preview.classId, ownerId: preview.ownerId, uid: student.uid,
    studentName: student.name, studentPhotoURL: student.photoURL, className: preview.className,
    status: preview.requireApproval ? 'pending' : 'active', codeUsed: normalized, joinedAt: now, updatedAt: now,
  })
  try {
    await setDoc(ref, enrollment)
    return { outcome: enrollment.status === 'pending' ? 'pending_approval' : 'joined', enrollment: { ...enrollment, id: ref.id } }
  } catch (reason) {
    const raced = await existingOutcome(ref)
    if (raced) return raced
    if (isPermissionDenied(reason)) {
      const latest = await getDoc(doc(db, 'classCodes', normalized))
      if (!latest.exists()) return { outcome: 'not_found' }
      const latestPreview = parseClassCode(latest.data())
      if (latestPreview.archived) return { outcome: 'class_archived' }
      if (!latestPreview.joinEnabled) return { outcome: 'joining_paused' }
    }
    throw reason
  }
}

export async function leaveClass(classId: string, uid: string, db: Firestore = firestore): Promise<void> {
  const ref = enrollmentRef(db, classId, uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return
  if (snapshot.data().status === 'blocked') throw new Error('Blocked enrollments cannot be left.')
  await deleteDoc(ref)
}

export function listMyEnrollments(uid: string, onChange: (enrollments: EnrollmentWithId[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(collection(db, 'enrollments'), where('uid', '==', uid), orderBy('joinedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...parseEnrollment(item.data()), id: item.id }))), onError)
}
