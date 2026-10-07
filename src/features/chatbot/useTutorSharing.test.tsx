import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompleteFn } from '../../lib/groq/client'
import { createMemoryStorage } from './storage'
import { createSharedThread, syncSharedThread } from './sharedThreadService'
import { useChatbot } from './useChatbot'
import { useTutorSharing } from './useTutorSharing'

vi.mock('./sharedThreadService', () => ({
  createSharedThread: vi.fn().mockResolvedValue(undefined),
  syncSharedThread: vi.fn().mockResolvedValue(undefined),
  watchSharedTutorThread: vi.fn(() => vi.fn()),
}))

vi.mock('./sharedAccessService', () => ({
  watchAccessibleTutorThreads: vi.fn((_uid: string, onChange: (refs: never[]) => void) => {
    onChange([])
    return vi.fn()
  }),
}))

describe('useTutorSharing', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('keeps private threads local and copies them remotely only after explicit sharing', async () => {
    const complete = vi.fn<CompleteFn>().mockResolvedValue('A focused explanation.')
    const storage = createMemoryStorage()
    const hook = renderHook(() => {
      const chat = useChatbot({ uid: 'learner-1', storage, complete, configIssue: null })
      const sharing = useTutorSharing('learner-1', 'Learner One', chat)
      return { chat, sharing }
    })
    await waitFor(() => expect(hook.result.current.chat.ready).toBe(true))

    act(() => {
      hook.result.current.chat.send({ text: 'Explain this topic', images: [] })
    })
    await waitFor(() => expect(hook.result.current.chat.activeThread?.messages).toHaveLength(2))
    await waitFor(async () => expect((await storage.load('learner-1'))[0]?.messages).toHaveLength(2))
    expect(createSharedThread).not.toHaveBeenCalled()
    expect(syncSharedThread).not.toHaveBeenCalled()

    const thread = hook.result.current.chat.activeThread!
    await act(async () => hook.result.current.sharing.shareThread(thread))

    expect(createSharedThread).toHaveBeenCalledWith(thread, 'learner-1', 'Learner One')
    expect(syncSharedThread).not.toHaveBeenCalled()
    await waitFor(() => expect(hook.result.current.chat.activeThread?.sharedRole).toBe('owner'))
  })
})
