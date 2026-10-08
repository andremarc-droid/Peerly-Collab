import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { firebaseApp } from './app'

export const functions = getFunctions(firebaseApp, 'us-central1')

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}
