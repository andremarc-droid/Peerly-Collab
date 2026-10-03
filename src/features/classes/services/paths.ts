import { collection, doc, type Firestore } from 'firebase/firestore'

export const classRef = (db: Firestore, classId: string) => doc(db, 'classes', classId)
export const classCodeRef = (db: Firestore, code: string) => doc(db, 'classCodes', code)
export const classesRef = (db: Firestore) => collection(db, 'classes')
export const enrollmentsRef = (db: Firestore) => collection(db, 'enrollments')
export const enrollmentRef = (db: Firestore, classId: string, uid: string) => doc(db, 'enrollments', `${classId}_${uid}`)
