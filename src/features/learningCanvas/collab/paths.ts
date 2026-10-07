import { collection, doc, type CollectionReference, type DocumentReference, type Firestore } from 'firebase/firestore'

const canvasPath = (classId: string, canvasId: string) =>
  ['classes', classId, 'learningCanvases', canvasId] as const

export const membersRef = (db: Firestore, classId: string, canvasId: string): CollectionReference =>
  collection(db, ...canvasPath(classId, canvasId), 'members')

export const memberRef = (db: Firestore, classId: string, canvasId: string, uid: string): DocumentReference =>
  doc(db, ...canvasPath(classId, canvasId), 'members', uid)

export const invitesRef = (db: Firestore, classId: string, canvasId: string): CollectionReference =>
  collection(db, ...canvasPath(classId, canvasId), 'invites')

export const inviteRef = (db: Firestore, classId: string, canvasId: string, token: string): DocumentReference =>
  doc(db, ...canvasPath(classId, canvasId), 'invites', token)

export const presenceCollectionRef = (db: Firestore, classId: string, canvasId: string): CollectionReference =>
  collection(db, ...canvasPath(classId, canvasId), 'presence')

export const presenceRef = (db: Firestore, classId: string, canvasId: string, uid: string): DocumentReference =>
  doc(db, ...canvasPath(classId, canvasId), 'presence', uid)

export const activityRef = (db: Firestore, classId: string, canvasId: string): CollectionReference =>
  collection(db, ...canvasPath(classId, canvasId), 'activity')

/** Every subcollection that must be emptied before a canvas can be deleted. */
export const CANVAS_SUBCOLLECTIONS = ['members', 'invites', 'presence', 'activity'] as const
