import { describe, expect, it } from 'vitest'
import { mapFirebaseAuthError } from './authErrors'

describe('mapFirebaseAuthError', () => {
  it.each([
    ['auth/wrong-password', 'That password is incorrect. Try again or reset it.'],
    ['auth/user-not-found', 'We couldn’t find an account with that email.'],
    ['auth/email-already-in-use', 'An account already uses this email. Try signing in instead.'],
    ['auth/weak-password', 'Choose a stronger password with at least 8 characters.'],
    ['auth/too-many-requests', 'Too many attempts. Wait a little while, then try again.'],
    ['auth/network-request-failed', 'We couldn’t connect. Check your internet connection and try again.'],
    ['auth/popup-closed-by-user', 'The Google sign-in window was closed before sign-in finished.'],
  ])('maps %s to a specific, friendly message', (code, message) => {
    expect(mapFirebaseAuthError({ code })).toBe(message)
  })

  it('returns a safe generic message for unknown or malformed errors', () => {
    expect(mapFirebaseAuthError({ code: 'auth/unmapped' })).toBe('We couldn’t complete that request. Please try again.')
    expect(mapFirebaseAuthError(null)).toBe('We couldn’t complete that request. Please try again.')
  })
})
