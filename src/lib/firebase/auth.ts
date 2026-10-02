import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { firebaseApp } from './app'

export const auth = getAuth(firebaseApp)

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
}
