import { Capacitor } from '@capacitor/core'
import { connectAuthEmulator, getAuth, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth'
import { firebaseApp } from './app'

export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence })
  : getAuth(firebaseApp)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}
