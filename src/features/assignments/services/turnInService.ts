import {
  collectionGroup, deleteDoc, deleteField, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
  type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseDriveFiles, parseGradeInput, parseTurnIn } from '../schemas'
import { MAX_TURN_IN_FILES, type DriveFile, type TurnInWithId } from '../types'
import { TURN_INS, turnInRef, turnInsRef } from './paths'

const PAGE = 400
const toError = (reason: unknown) => (reason instanceof Error ? reason : new Error('Turn-ins could not be loaded.'))

/** `estimate` keeps our own just-written turn-in readable before the server has stamped its time. */
function asTurnIn(snapshot: DocumentSnapshot | QueryDocumentSnapshot): TurnInWithId {
  return { ...parseTurnIn(snapshot.data({ serverTimestamps: 'estimate' })), assignmentId: snapshot.ref.parent.parent?.id ?? '', pendingWrite: snapshot.metadata.hasPendingWrites }
}

export interface TurnInInput {
  classId: string
  assignmentId: string
  studentId: string
  studentName: string
  files: DriveFile[]
}

/** Creates or replaces the student's single turn-in. The time is stamped by the server so it cannot be backdated. */
export async function submitTurnIn(input: TurnInInput, db: Firestore = firestore): Promise<void> {
  const files = parseDriveFiles(input.files, MAX_TURN_IN_FILES)
  if (files.length < 1) throw new Error('Add at least one file to turn in.')
  await setDoc(turnInRef(db, input.classId, input.assignmentId, input.studentId), {
    studentId: input.studentId,
    studentName: input.studentName.trim().slice(0, 120) || 'Student',
    classId: input.classId,
    files,
    turnedInAt: serverTimestamp(),
  })
}

export function subscribeToMyTurnIn(
  classId: string,
  assignmentId: string,
  studentId: string,
  onChange: (value: TurnInWithId | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(turnInRef(db, classId, assignmentId, studentId), (snapshot) => {
    try { onChange(snapshot.exists() ? asTurnIn(snapshot) : null) }
    catch (reason) { onError(toError(reason)) }
  }, onError)
}

/** Instructor view of every student's turn-in for one assignment. */
export function subscribeToTurnIns(
  classId: string,
  assignmentId: string,
  onChange: (items: TurnInWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  // Metadata changes are included so the screen can tell a saved grade from one still waiting to reach the server.
  return onSnapshot(query(turnInsRef(db, classId, assignmentId), orderBy('turnedInAt', 'desc')), { includeMetadataChanges: true }, (snapshot) => {
    try { onChange(snapshot.docs.map(asTurnIn)) }
    catch (reason) { onError(toError(reason)) }
  }, onError)
}

/** All of one student's turn-ins across classes (collection-group query, provable by rules via studentId). */
export function subscribeToMyTurnIns(
  studentId: string,
  onChange: (items: TurnInWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(query(collectionGroup(db, TURN_INS), where('studentId', '==', studentId)), (snapshot) => {
    try { onChange(snapshot.docs.map(asTurnIn)) }
    catch (reason) { onError(toError(reason)) }
  }, onError)
}

/** Used when a student deletes their account. Their Drive files are untouched; only our references are removed. */
export async function deleteMyTurnIns(studentId: string, db: Firestore = firestore): Promise<void> {
  while (true) {
    const page = await getDocs(query(collectionGroup(db, TURN_INS), where('studentId', '==', studentId), limit(PAGE)))
    if (page.empty) return
    const batch = writeBatch(db)
    page.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
    if (page.size < PAGE) return
  }
}

export async function withdrawTurnIn(classId: string, assignmentId: string, studentId: string, db: Firestore = firestore): Promise<void> {
  await deleteDoc(turnInRef(db, classId, assignmentId, studentId))
}

export interface GradeTurnInInput {
  classId: string
  assignmentId: string
  studentId: string
  /** The instructor giving the grade. Stored so it is clear who graded the work. */
  graderId: string
  /** The assignment's points, used to keep the grade in range. */
  points: number | null
  grade: number | null
  feedback: string
}

/**
 * Saves the instructor's grade and/or feedback on one student's turn-in. Leaving both empty removes the grade,
 * which also lets the student change their work again.
 */
export async function gradeTurnIn(input: GradeTurnInInput, db: Firestore = firestore): Promise<void> {
  const { grade, feedback } = parseGradeInput(input.grade, input.feedback, input.points)
  if (grade === null && !feedback) { await clearTurnInGrade(input.classId, input.assignmentId, input.studentId, db); return }
  await updateDoc(turnInRef(db, input.classId, input.assignmentId, input.studentId), {
    grade: grade ?? deleteField(),
    feedback: feedback || deleteField(),
    gradedAt: serverTimestamp(),
    gradedBy: input.graderId,
  })
}

/** Removes the grade and feedback. The turn-in itself and the student's files are untouched. */
export async function clearTurnInGrade(classId: string, assignmentId: string, studentId: string, db: Firestore = firestore): Promise<void> {
  await updateDoc(turnInRef(db, classId, assignmentId, studentId), {
    grade: deleteField(), feedback: deleteField(), gradedAt: deleteField(), gradedBy: deleteField(),
  })
}
