import { deleteDoc, doc, getCountFromServer, getDoc, getDocs, onSnapshot, orderBy, query, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseEnrollment } from '../schemas'
import type { EnrollmentRecord, EnrollmentStatus, EnrollmentWithId } from '../types'
import { enrollmentRef, enrollmentsRef } from './paths'

export async function listEnrollments(classId: string, ownerId: string, db: Firestore = firestore): Promise<EnrollmentWithId[]> {
  const result = await getDocs(query(enrollmentsRef(db), where('ownerId', '==', ownerId), where('classId', '==', classId), orderBy('joinedAt', 'desc')))
  return result.docs.map((item) => ({ ...parseEnrollment(item.data()), id: item.id }))
}

export function watchEnrollments(classId: string, ownerId: string, onChange: (items: EnrollmentWithId[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(enrollmentsRef(db), where('ownerId', '==', ownerId), where('classId', '==', classId), orderBy('joinedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...parseEnrollment(item.data()), id: item.id }))), onError)
}

export async function countStudentsInClass(classId: string, ownerId: string, db: Firestore = firestore): Promise<number> {
  const result = await getCountFromServer(query(enrollmentsRef(db), where('ownerId', '==', ownerId), where('classId', '==', classId), where('status', '==', 'active')))
  return result.data().count
}

export async function countPendingEnrollments(classId: string, ownerId: string, db: Firestore = firestore): Promise<number> {
  const result = await getCountFromServer(query(enrollmentsRef(db), where('ownerId', '==', ownerId), where('classId', '==', classId), where('status', '==', 'pending')))
  return result.data().count
}

export async function countClassEnrollments(classId: string, ownerId: string, db: Firestore = firestore): Promise<number> {
  const result = await getCountFromServer(query(enrollmentsRef(db), where('ownerId', '==', ownerId), where('classId', '==', classId)))
  return result.data().count
}

async function setStatus(classId: string, uid: string, status: EnrollmentStatus, db: Firestore): Promise<void> {
  const ref = enrollmentRef(db, classId, uid)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('Enrollment not found.')
  await updateDoc(ref, { status })
}

export const approveEnrollment = (classId: string, uid: string, db: Firestore = firestore) => setStatus(classId, uid, 'active', db)
export const blockStudent = (classId: string, uid: string, db: Firestore = firestore) => setStatus(classId, uid, 'blocked', db)
export const unblockStudent = (classId: string, uid: string, db: Firestore = firestore) => setStatus(classId, uid, 'active', db)

export async function declineEnrollment(classId: string, uid: string, db: Firestore = firestore): Promise<void> {
  await deleteDoc(enrollmentRef(db, classId, uid))
}

export const removeStudent = declineEnrollment

export async function deleteEnrollmentRecords(records: EnrollmentRecord[], db: Firestore = firestore): Promise<void> {
  for (let start = 0; start < records.length; start += 400) {
    const batch = writeBatch(db)
    records.slice(start, start + 400).forEach((record) => batch.delete(doc(db, 'enrollments', `${record.classId}_${record.uid}`)))
    await batch.commit()
  }
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function buildRosterCsv(enrollments: EnrollmentWithId[]): string {
  const rows = [['Student name', 'Status', 'Joined at', 'Join code'], ...enrollments.map((item) => [item.studentName, item.status, item.joinedAt.toDate().toISOString(), item.codeUsed])]
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}
