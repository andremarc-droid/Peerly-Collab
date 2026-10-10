import { beforeEach, describe, expect, it, vi } from 'vitest'

const callable = vi.fn()
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }))
vi.mock('../../lib/firebase/functions', () => ({ functions: {} }))
vi.mock('../../lib/firebase/firestore', () => ({ firestore: {} }))

import { httpsCallable } from 'firebase/functions'
import { cleanupGames, describeGameError, joinGame, submitAnswer } from './services'

describe('games services', () => {
  beforeEach(() => { callable.mockReset().mockResolvedValue({ data: { gameId: 'g1' } }) })

  it('normalizes the code and cleans the name before calling joinGame', async () => {
    await expect(joinGame(' abc-234 ', '  Ana  ')).resolves.toEqual({ gameId: 'g1' })
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'joinGame')
    expect(callable).toHaveBeenCalledWith({ code: 'ABC234', displayName: 'Ana' })
  })

  it('refuses invalid join input without calling the server', async () => {
    await expect(joinGame('ABC', 'Ana')).rejects.toThrow('6-character')
    await expect(joinGame('ABC234', '   ')).rejects.toThrow('name')
    expect(callable).not.toHaveBeenCalled()
  })

  it('sends only ids and indexes when submitting an answer, never a score or time', async () => {
    await submitAnswer('g1', 2, 1)
    expect(callable).toHaveBeenCalledWith({ gameId: 'g1', questionIndex: 2, optionIndex: 1 })
  })

  it('lets a cleanup failure reach the caller so account deletion can be retried', async () => {
    callable.mockRejectedValueOnce(new Error('network'))
    await expect(cleanupGames()).rejects.toThrow('network')
  })

  it('shows server messages, hides internal errors and explains offline failures', () => {
    expect(describeGameError({ code: 'functions/failed-precondition', message: 'This game has already started.' })).toBe('This game has already started.')
    expect(describeGameError({ code: 'functions/internal', message: 'INTERNAL' })).toBe('Something went wrong. Please try again.')
    expect(describeGameError({ code: 'functions/unavailable', message: 'x' })).toContain('offline')
    expect(describeGameError(new Error('boom'))).toBe('Something went wrong. Please try again.')
  })
})
