import { validateFirebaseEnv } from './requiredEnv'

export const firebaseConfig = validateFirebaseEnv(import.meta.env)
