import { collection, doc, type Firestore } from 'firebase/firestore'

// The subcollection is named `turnIns`, not `submissions`: the legacy notes feature already owns a top-level
// `submissions` collection and a collection-group rule on that name would also match it.
export const TURN_INS = 'turnIns'

export const assignmentsRef = (db: Firestore, classId: string) => collection(db, 'classes', classId, 'assignments')
export const assignmentRef = (db: Firestore, classId: string, assignmentId: string) => doc(db, 'classes', classId, 'assignments', assignmentId)
export const turnInsRef = (db: Firestore, classId: string, assignmentId: string) => collection(db, 'classes', classId, 'assignments', assignmentId, TURN_INS)
export const turnInRef = (db: Firestore, classId: string, assignmentId: string, studentId: string) => doc(db, 'classes', classId, 'assignments', assignmentId, TURN_INS, studentId)
