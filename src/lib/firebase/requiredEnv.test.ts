import { describe, expect, it } from 'vitest'
import { requiredFirebaseEnv, validateFirebaseEnv } from './requiredEnv'

describe('validateFirebaseEnv', () => {
  it('names every missing Firebase variable in its error', () => {
    expect(() => validateFirebaseEnv({})).toThrow(
      `Missing required Firebase environment variables: ${requiredFirebaseEnv.join(', ')}`,
    )
  })

  it('returns the Firebase configuration when all variables are present', () => {
    const env = Object.fromEntries(requiredFirebaseEnv.map((key) => [key, key]))
    expect(validateFirebaseEnv(env)).toEqual({
      apiKey: 'VITE_FIREBASE_API_KEY',
      authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
      projectId: 'VITE_FIREBASE_PROJECT_ID',
      storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
      messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
      appId: 'VITE_FIREBASE_APP_ID',
    })
  })
})
