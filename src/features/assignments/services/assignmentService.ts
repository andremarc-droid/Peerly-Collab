import { doc, getDoc, onSnapshot, orderBy, query, setDoc, Timestamp, updateDoc, where, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { sortForStudents } from '../format'
import { getPublishIssue, parseAssignment } from '../schemas'
import { MAX_TITLE_LENGTH, type AssignmentPatch, type AssignmentRecord, type AssignmentWithId } from '../types'
import { assignmentRef, assignmentsRef } from './paths'

const asAssignment = (classId: string, id: string, data: unknown): AssignmentWithId => ({ ...parseAssignment(data), id, classId })
const toError = (reason: unknown) => (reason instanceof Error ? reason : new Error('Assignments could not be loaded.'))

function cleanPatch(patch: AssignmentPatch): AssignmentPatch {
  return patch.title === undefined ? patch : { ...patch, title: patch.title.trim().slice(0, MAX_TITLE_LENGTH) }
}

/** Creates an empty draft so the instructor can start with just a title and fill in the rest next. */
export async function createAssignment(classId: string, ownerId: string, title = 'Untitled assignment', db: Firestore = firestore): Promise<string> {
  const ref = doc(assignmentsRef(db, classId))
  const now = Timestamp.now()
  const value: AssignmentRecord = {
    ownerId, title: title.trim().slice(0, MAX_TITLE_LENGTH) || 'Untitled assignment', instructions: '', status: 'draft',
    dueAt: null, points: null, acceptsTurnIn: true, collectorEmail: null, attachments: [],
    createdAt: now, updatedAt: now, publishedAt: null,
  }
  await setDoc(ref, parseAssignment(value))
  return ref.id
}

export async function updateAssignment(classId: string, id: string, patch: AssignmentPatch, db: Firestore = firestore): Promise<void> {
  const ref = assignmentRef(db, classId, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('Assignment not found.')
  const clean = cleanPatch(patch)
  const next = parseAssignment({ ...snapshot.data(), ...clean, updatedAt: Timestamp.now() })
  await updateDoc(ref, { ...clean, updatedAt: next.updatedAt })
}

async function setPublished(classId: string, id: string, published: boolean, db: Firestore): Promise<void> {
  const ref = assignmentRef(db, classId, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) throw new Error('Assignment not found.')
  const current = parseAssignment(snapshot.data())
  if (published) {
    const issue = getPublishIssue(current)
    if (issue) throw new Error(issue)
  }
  const now = Timestamp.now()
  await updateDoc(ref, { status: published ? 'published' : 'draft', publishedAt: published ? now : null, updatedAt: now })
}

export const publishAssignment = (classId: string, id: string, db: Firestore = firestore) => setPublished(classId, id, true, db)
export const unpublishAssignment = (classId: string, id: string, db: Firestore = firestore) => setPublished(classId, id, false, db)

/** Students only ever query published assignments, which is the filter the security rules can prove. */
export function subscribeToAssignments(
  classId: string,
  role: 'instructor' | 'student',
  onChange: (items: AssignmentWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const base = assignmentsRef(db, classId)
  const q = role === 'student' ? query(base, where('status', '==', 'published')) : query(base, orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    try {
      const items = snapshot.docs.map((item) => asAssignment(classId, item.id, item.data()))
      onChange(role === 'student' ? sortForStudents(items) : items)
    } catch (reason) { onError(toError(reason)) }
  }, onError)
}

export function subscribeToAssignment(
  classId: string,
  id: string,
  onChange: (item: AssignmentWithId | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(assignmentRef(db, classId, id), (snapshot) => {
    try { onChange(snapshot.exists() ? asAssignment(classId, snapshot.id, snapshot.data()) : null) }
    catch (reason) { onError(toError(reason)) }
  }, onError)
}
