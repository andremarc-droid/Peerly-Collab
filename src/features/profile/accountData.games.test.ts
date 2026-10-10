import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import { deleteAccountData } from './accountData'
import { cleanupGroups } from '../groups/services'
import { cleanupGames } from '../games/services'

vi.mock('../groups/services', () => ({ cleanupGroups: vi.fn() }))
vi.mock('../games/services', () => ({ cleanupGames: vi.fn() }))

/** A database stand-in that fails loudly if account deletion touches it. */
const untouchedDb = new Proxy({}, { get() { throw new Error('The database must not be touched when game cleanup fails.') } }) as unknown as Firestore

describe('deleteAccountData game cleanup', () => {
  beforeEach(() => {
    vi.mocked(cleanupGroups).mockResolvedValue({ success: true } as never)
  })

  it('stops with a retryable error and deletes nothing when game cleanup fails', async () => {
    vi.mocked(cleanupGames).mockRejectedValueOnce(new Error('Could not clean up your games. Try again.'))
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('Could not clean up your games. Try again.')
    expect(cleanupGames).toHaveBeenCalledOnce()
  })

  it('runs game cleanup after group cleanup and before anything is deleted', async () => {
    const order: string[] = []
    vi.mocked(cleanupGroups).mockImplementationOnce((async () => { order.push('groups') }) as never)
    vi.mocked(cleanupGames).mockImplementationOnce((async () => { order.push('games'); throw new Error('stop here') }) as never)
    await expect(deleteAccountData('learner', 'student', untouchedDb)).rejects.toThrow('stop here')
    expect(order).toEqual(['groups', 'games'])
  })
})
