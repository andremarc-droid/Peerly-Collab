import { describe, expect, it } from 'vitest'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { GroupQuizError } from './groupQuizLogic'
import { HttpsError as CustomHttpsError } from './groupQuizData'
import { toRealHttpsError, wrapGroupQuizHandler } from './groupQuizErrorMapping'

describe('groupQuizErrorMapping', () => {
  it('maps GroupQuizError to real firebase-functions HttpsError', () => {
    const error = new GroupQuizError('This team is full.', 'failed-precondition')
    const realError = toRealHttpsError(error)
    expect(realError).toBeInstanceOf(HttpsError)
    expect(realError.code).toBe('failed-precondition')
    expect(realError.message).toBe('This team is full.')
  })

  it('maps custom HttpsError to real firebase-functions HttpsError', () => {
    const error = new CustomHttpsError('not-found', 'Quiz not found.')
    const realError = toRealHttpsError(error)
    expect(realError).toBeInstanceOf(HttpsError)
    expect(realError.code).toBe('not-found')
    expect(realError.message).toBe('Quiz not found.')
  })

  it('maps unexpected Error to internal HttpsError', () => {
    const error = new Error('Unexpected crash')
    const realError = toRealHttpsError(error)
    expect(realError).toBeInstanceOf(HttpsError)
    expect(realError.code).toBe('internal')
    expect(realError.message).toBe('Unexpected crash')
  })

  it('passes through real firebase-functions HttpsError unchanged', () => {
    const original = new HttpsError('permission-denied', 'Denied')
    const mapped = toRealHttpsError(original)
    expect(mapped).toBe(original)
  })

  it('wrapGroupQuizHandler wraps a throwing handler and rethrows real HttpsError', async () => {
    const handler = wrapGroupQuizHandler(async () => {
      throw new GroupQuizError('Team does not exist.', 'not-found')
    })
    const call = {} as CallableRequest<unknown>
    await expect(handler(call)).rejects.toThrow(HttpsError)
    try {
      await handler(call)
    } catch (err) {
      const httpsErr = err as HttpsError
      expect(httpsErr.code).toBe('not-found')
      expect(httpsErr.message).toBe('Team does not exist.')
    }
  })
})
