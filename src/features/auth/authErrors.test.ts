import { describe, expect, it } from 'vitest'
import { AccountNotRegisteredError, isAccountNotRegisteredError, mapFirebaseAuthError } from './authErrors'

describe('mapFirebaseAuthError', () => {
  it.each([
    ['auth/wrong-password', 'That password is incorrect. Try again or reset it.'],
    ['auth/user-not-found', 'This account hasn’t been registered yet. Create an account?'],
    ['app/account-not-registered', 'This account hasn’t been registered yet. Create an account?'],
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

describe('isAccountNotRegisteredError', () => {
  it('recognises Firebase user-not-found and the app-level error', () => {
    expect(isAccountNotRegisteredError({ code: 'auth/user-not-found' })).toBe(true)
    expect(isAccountNotRegisteredError(new AccountNotRegisteredError())).toBe(true)
  })

  it('does not treat wrong passwords or other failures as unregistered', () => {
    expect(isAccountNotRegisteredError({ code: 'auth/wrong-password' })).toBe(false)
    expect(isAccountNotRegisteredError({ code: 'auth/invalid-credential' })).toBe(false)
    expect(isAccountNotRegisteredError(null)).toBe(false)
  })
})
