import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { deleteAccountData } from './accountData'
import { cleanupGroups } from '../groups/services'
import { cleanupGames } from '../games/services'
import { cleanupGroupQuizData } from '../quizzes/services/teamService'

vi.mock('../groups/services', () => ({ cleanupGroups: vi.fn() }))
vi.mock('../games/services', () => ({ cleanupGames: vi.fn() }))
vi.mock('../quizzes/services/teamService', () => ({ cleanupGroupQuizData: vi.fn() }))

/** A database stand-in that fails loudly if account deletion touches it. */
const untouchedDb = new Proxy({}, { get() { throw new Error('The database must not be touched when group quiz cleanup fails.') } }) as unknown as Firestore

describe('deleteAccountData group quiz cleanup', () => {
  beforeEach(() => {
    vi.mocked(cleanupGroups).mockReset().mockResolvedValue({ success: true } as never)
    vi.mocked(cleanupGames).mockReset().mockResolvedValue({ success: true } as never)
    vi.mocked(cleanupGroupQuizData).mockReset()
  })

  it('stops with a retryable error and deletes nothing when group quiz cleanup fails', async () => {
    vi.mocked(cleanupGroupQuizData).mockRejectedValueOnce(new Error('Could not leave your quiz teams. Try again.'))
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('Could not leave your quiz teams. Try again.')
    expect(cleanupGroupQuizData).toHaveBeenCalledOnce()
  })

  it('runs group quiz cleanup after group and game cleanup and before anything is deleted', async () => {
    const order: string[] = []
    vi.mocked(cleanupGroups).mockImplementationOnce((async () => { order.push('groups') }) as never)
    vi.mocked(cleanupGames).mockImplementationOnce((async () => { order.push('games') }) as never)
    vi.mocked(cleanupGroupQuizData).mockImplementationOnce((async () => { order.push('groupQuizzes'); throw new Error('stop here') }) as never)
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('stop here')
    expect(order).toEqual(['groups', 'games', 'groupQuizzes'])
  })

  it('does not call group quiz cleanup when an earlier cleanup already failed', async () => {
    vi.mocked(cleanupGames).mockRejectedValueOnce(new Error('games failed'))
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('games failed')
    expect(cleanupGroupQuizData).not.toHaveBeenCalled()
  })
})
