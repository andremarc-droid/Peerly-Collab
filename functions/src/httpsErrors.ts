export type FunctionsErrorCode =
  | 'ok'
  | 'cancelled'
  | 'unknown'
  | 'invalid-argument'
  | 'deadline-exceeded'
  | 'not-found'
  | 'already-exists'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'aborted'
  | 'out-of-range'
  | 'unimplemented'
  | 'internal'
  | 'unavailable'
  | 'data-loss'
  | 'unauthenticated'

const ERROR_CODE_HTTP_STATUS: Record<FunctionsErrorCode, { status: number; canonicalName: string }> = {
  ok: { status: 200, canonicalName: 'OK' },
  cancelled: { status: 499, canonicalName: 'CANCELLED' },
  unknown: { status: 500, canonicalName: 'UNKNOWN' },
  'invalid-argument': { status: 400, canonicalName: 'INVALID_ARGUMENT' },
  'deadline-exceeded': { status: 504, canonicalName: 'DEADLINE_EXCEEDED' },
  'not-found': { status: 404, canonicalName: 'NOT_FOUND' },
  'already-exists': { status: 409, canonicalName: 'ALREADY_EXISTS' },
  'permission-denied': { status: 403, canonicalName: 'PERMISSION_DENIED' },
  'resource-exhausted': { status: 429, canonicalName: 'RESOURCE_EXHAUSTED' },
  'failed-precondition': { status: 400, canonicalName: 'FAILED_PRECONDITION' },
  aborted: { status: 409, canonicalName: 'ABORTED' },
  'out-of-range': { status: 400, canonicalName: 'OUT_OF_RANGE' },
  unimplemented: { status: 501, canonicalName: 'UNIMPLEMENTED' },
  internal: { status: 500, canonicalName: 'INTERNAL' },
  unavailable: { status: 503, canonicalName: 'UNAVAILABLE' },
  'data-loss': { status: 500, canonicalName: 'DATA_LOSS' },
  unauthenticated: { status: 401, canonicalName: 'UNAUTHENTICATED' },
}

/**
 * Lightweight, portable HttpsError replacement with zero external dependencies.
 * Works seamlessly in Cloud Functions, on Vercel serverless endpoints, and in tests
 * without pulling in `firebase-functions` (which triggers `ERR_REQUIRE_ESM` via jose/jwks-rsa).
 */
export class HttpsError extends Error {
  readonly code: FunctionsErrorCode
  readonly details?: unknown
  readonly httpErrorCode: { status: number; canonicalName: string }

  constructor(code: FunctionsErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpsError'
    this.code = code
    this.details = details
    this.httpErrorCode = ERROR_CODE_HTTP_STATUS[code] ?? { status: 500, canonicalName: 'INTERNAL' }
  }
}
