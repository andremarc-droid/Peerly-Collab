import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { deleteAccountData } from './accountData'
import { cleanupGroupQuizData } from '../quizzes/services/teamService'

vi.mock('../quizzes/services/teamService', () => ({ cleanupGroupQuizData: vi.fn() }))

/** A database stand-in that fails loudly if account deletion touches it. */
const untouchedDb = new Proxy({}, { get() { throw new Error('The database must not be touched when group quiz cleanup fails.') } }) as unknown as Firestore

describe('deleteAccountData group quiz cleanup', () => {
  beforeEach(() => {
    vi.mocked(cleanupGroupQuizData).mockReset()
  })

  it('stops with a retryable error and deletes nothing when group quiz cleanup fails', async () => {
    vi.mocked(cleanupGroupQuizData).mockRejectedValueOnce(new Error('Could not leave your quiz teams. Try again.'))
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('Could not leave your quiz teams. Try again.')
    expect(cleanupGroupQuizData).toHaveBeenCalledOnce()
  })

  it('runs group quiz cleanup before anything is deleted from firestore', async () => {
    const order: string[] = []
    vi.mocked(cleanupGroupQuizData).mockImplementationOnce((async () => { order.push('groupQuizzes'); throw new Error('stop here') }) as never)
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('stop here')
    expect(order).toEqual(['groupQuizzes'])
  })
})
