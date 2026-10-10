import { doc, type Firestore } from 'firebase/firestore'
export const deckProgressRef = (db: Firestore, uid: string, key: string) => doc(db, 'users', uid, 'deckProgress', key)
export const studyAttemptsRef = (db: Firestore, uid: string) => doc(db, 'users', uid, 'studyAttempts')
