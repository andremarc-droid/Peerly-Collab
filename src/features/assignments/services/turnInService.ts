import {
  collectionGroup, deleteDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, writeBatch,
  type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseDriveFiles, parseTurnIn } from '../schemas'
import { MAX_TURN_IN_FILES, type DriveFile, type TurnInWithId } from '../types'
import { TURN_INS, turnInRef, turnInsRef } from './paths'

const PAGE = 400
const toError = (reason: unknown) => (reason instanceof Error ? reason : new Error('Turn-ins could not be loaded.'))

/** `estimate` keeps our own just-written turn-in readable before the server has stamped its time. */
function asTurnIn(snapshot: DocumentSnapshot | QueryDocumentSnapshot): TurnInWithId {
  return { ...parseTurnIn(snapshot.data({ serverTimestamps: 'estimate' })), assignmentId: snapshot.ref.parent.parent?.id ?? '' }
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
  return onSnapshot(query(turnInsRef(db, classId, assignmentId), orderBy('turnedInAt', 'desc')), (snapshot) => {
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
