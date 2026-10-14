import { HttpsError, type CallableRequest, type FunctionsErrorCode } from 'firebase-functions/v2/https'

const VALID_CODES = new Set<string>([
  'ok', 'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists',
  'permission-denied', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range',
  'unimplemented', 'internal', 'unavailable', 'data-loss', 'unauthenticated',
])

export function toRealHttpsError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const rawCode = (error as { code: string }).code
    const code: FunctionsErrorCode = VALID_CODES.has(rawCode) ? (rawCode as FunctionsErrorCode) : 'internal'
    return new HttpsError(code, (error as { message: string }).message)
  }
  return new HttpsError('internal', error instanceof Error ? error.message : 'Internal error')
}

export function wrapGroupQuizHandler<I, O>(handler: (call: CallableRequest<I>) => Promise<O>) {
  return async (call: CallableRequest<I>): Promise<O> => {
    try {
      return await handler(call)
    } catch (error) {
      throw toRealHttpsError(error)
    }
  }
}
