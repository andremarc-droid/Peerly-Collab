import { describe, expect, it } from 'vitest'
import { HttpsError } from './httpsErrors.js'

describe('HttpsError', () => {
  it('maps known error codes to correct HTTP status codes', () => {
    const unauth = new HttpsError('unauthenticated', 'Must sign in')
    expect(unauth.code).toBe('unauthenticated')
    expect(unauth.message).toBe('Must sign in')
    expect(unauth.httpErrorCode).toEqual({ status: 401, canonicalName: 'UNAUTHENTICATED' })

    const invalidArg = new HttpsError('invalid-argument', 'Bad argument')
    expect(invalidArg.httpErrorCode).toEqual({ status: 400, canonicalName: 'INVALID_ARGUMENT' })

    const notFound = new HttpsError('not-found', 'Missing doc')
    expect(notFound.httpErrorCode).toEqual({ status: 404, canonicalName: 'NOT_FOUND' })

    const permDenied = new HttpsError('permission-denied', 'No access')
    expect(permDenied.httpErrorCode).toEqual({ status: 403, canonicalName: 'PERMISSION_DENIED' })
  })

  it('preserves error details when supplied', () => {
    const error = new HttpsError('invalid-argument', 'Validation failed', { field: 'displayName' })
    expect(error.details).toEqual({ field: 'displayName' })
  })
})
