import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getFirestore } from 'firebase-admin/firestore'
import { savePublicDeckHandler } from './publicDecks'

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: vi.fn(),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
      increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
  }
})

describe('savePublicDeckHandler', () => {
  const mockedGetFirestore = vi.mocked(getFirestore)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    await expect(
      savePublicDeckHandler({
        auth: null,
        data: { deckId: 'deck-123' },
      } as any),
    ).rejects.toThrow('You must be signed in to save a public deck.')
  })

  it('rejects missing or empty deckId', async () => {
    await expect(
      savePublicDeckHandler({
        auth: { uid: 'user-1' },
        data: { deckId: '   ' },
      } as any),
    ).rejects.toThrow('A valid deckId is required.')
  })

  it('increments savesCount when not previously saved by user', async () => {
    const mockDeckSnap = {
      exists: true,
      data: () => ({ savesCount: 5 }),
    }
    const mockSaveSnap = {
      exists: false,
    }

    const transaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.path.includes('publicDeckSaves')) return mockSaveSnap
        return mockDeckSnap
      }),
      set: vi.fn(),
      update: vi.fn(),
    }

    const mockDb = {
      doc: vi.fn().mockImplementation((path: string) => ({ path })),
      runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
    }
    mockedGetFirestore.mockReturnValue(mockDb as any)

    const result = await savePublicDeckHandler({
      auth: { uid: 'user-1' },
      data: { deckId: 'deck-123' },
    } as any)

    expect(result).toEqual({ success: true, savesCount: 6 })
    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'publicDeckSaves/deck-123_user-1' },
      expect.objectContaining({ deckId: 'deck-123', userId: 'user-1' }),
    )
    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'publicDecks/deck-123' },
      { savesCount: 'INCREMENT_1' },
    )
  })

  it('returns alreadySaved without incrementing when already saved', async () => {
    const mockDeckSnap = {
      exists: true,
      data: () => ({ savesCount: 5 }),
    }
    const mockSaveSnap = {
      exists: true,
    }

    const transaction = {
      get: vi.fn().mockImplementation(async (ref: any) => {
        if (ref.path.includes('publicDeckSaves')) return mockSaveSnap
        return mockDeckSnap
      }),
      set: vi.fn(),
      update: vi.fn(),
    }

    const mockDb = {
      doc: vi.fn().mockImplementation((path: string) => ({ path })),
      runTransaction: vi.fn().mockImplementation(async (cb: any) => cb(transaction)),
    }
    mockedGetFirestore.mockReturnValue(mockDb as any)

    const result = await savePublicDeckHandler({
      auth: { uid: 'user-1' },
      data: { deckId: 'deck-123' },
    } as any)

    expect(result).toEqual({ success: true, alreadySaved: true, savesCount: 5 })
    expect(transaction.set).not.toHaveBeenCalled()
    expect(transaction.update).not.toHaveBeenCalled()
  })
})
