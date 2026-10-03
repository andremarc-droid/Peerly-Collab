import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { firebaseApp } from './app'

export const firestore = getFirestore(firebaseApp)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(firestore, '127.0.0.1', 8180)
}
