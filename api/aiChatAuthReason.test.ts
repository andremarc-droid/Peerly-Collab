import { describe, expect, it } from 'vitest'
import { authFailureReason } from './aiChat.js'

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code })

describe('authFailureReason', () => {
  it('flags a service account from a different Firebase project', () => {
    expect(authFailureReason(withCode('Firebase ID token has incorrect "aud" (audience) claim. Expected "a" but got "b".', 'auth/argument-error'))).toBe('wrong-firebase-project')
    expect(authFailureReason(withCode('Firebase ID token has incorrect "iss" (issuer) claim.', 'auth/argument-error'))).toBe('wrong-firebase-project')
  })

  it('names expired, revoked and disabled sessions', () => {
    expect(authFailureReason(withCode('expired', 'auth/id-token-expired'))).toBe('token-expired')
    expect(authFailureReason(withCode('revoked', 'auth/id-token-revoked'))).toBe('token-revoked')
    expect(authFailureReason(withCode('disabled', 'auth/user-disabled'))).toBe('user-disabled')
  })

  it('flags a service account that is not allowed to check revocation', () => {
    expect(authFailureReason(withCode('Caller does not have permission', 'auth/insufficient-permission'))).toBe('service-account-permission')
    expect(authFailureReason(withCode('Identity Toolkit API has not been used in project 1 before', 'auth/internal-error'))).toBe('service-account-permission')
  })

  it('falls back to the bare error code and never echoes the raw message', () => {
    expect(authFailureReason(withCode('secret detail', 'auth/argument-error'))).toBe('argument-error')
    expect(authFailureReason(new Error('secret detail'))).toBe('unknown')
    expect(authFailureReason(null)).toBe('unknown')
  })
})
