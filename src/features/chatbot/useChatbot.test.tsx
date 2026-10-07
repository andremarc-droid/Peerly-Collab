import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompleteFn } from '../../lib/groq/client'
import { MAX_MESSAGE_CHARS } from './constants'
import { createMemoryStorage, type ChatStorage } from './storage'
import { makeImage } from './testFactories'
import { appendMessage, createThread, createUserMessage } from './threadUtils'
import type { ChatImage } from './types'
import { useChatbot } from './useChatbot'

async function openChat(complete: CompleteFn, storage: ChatStorage = createMemoryStorage(), uid = 'u1') {
  const hook = renderHook(() => useChatbot({ uid, storage, complete, configIssue: null }))
  await waitFor(() => expect(hook.result.current.ready).toBe(true))
  return { ...hook, storage }
}

type OpenChat = Awaited<ReturnType<typeof openChat>>

function ask(chat: OpenChat, text: string, images: ChatImage[] = []) {
  act(() => {
    chat.result.current.send({ text, images })
  })
}

function messageCount(chat: OpenChat): number {
  return chat.result.current.activeThread?.messages.length ?? 0
}

async function waitForSaved(storage: ChatStorage, uid: string, count: number) {
  await waitFor(async () => {
    const saved = await storage.load(uid)
    expect(saved[0]?.messages).toHaveLength(count)
  })
}

describe('useChatbot', () => {
  afterEach(cleanup)

  it('answers a message and saves the chat on this device', async () => {
    const complete = vi.fn<CompleteFn>().mockResolvedValue('A cell is the basic unit of life.')
    const chat = await openChat(complete)

    ask(chat, 'What is a cell?')
    await waitFor(() => expect(messageCount(chat)).toBe(2))

    expect(chat.result.current.activeThread?.title).toBe('What is a cell?')
    await waitForSaved(chat.storage, 'u1', 2)
    const [saved] = await chat.storage.load('u1')
    expect(saved.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
  })

  it('sends attached images as base64 data URLs', async () => {
    const complete = vi.fn<CompleteFn>().mockResolvedValue('It looks like a fern.')
    const chat = await openChat(complete)

    ask(chat, 'What is this?', [makeImage('plant.jpg')])
    await waitFor(() => expect(messageCount(chat)).toBe(2))

    const sent = complete.mock.calls[0][0].messages
    expect(sent[sent.length - 1].content).toEqual([
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ])
  })

  it('rejects an over-long message without calling the AI', async () => {
    const complete = vi.fn<CompleteFn>()
    const chat = await openChat(complete)

    let accepted = true
    act(() => {
      accepted = chat.result.current.send({ text: 'x'.repeat(MAX_MESSAGE_CHARS + 1), images: [] })
    })

    expect(accepted).toBe(false)
    expect(complete).not.toHaveBeenCalled()
  })

  describe('retry', () => {
    it('marks the message failed, then Retry sends it again and gets the reply', async () => {
      const complete = vi
        .fn<CompleteFn>()
        .mockRejectedValueOnce(new Error('The AI is busy right now (rate limit).'))
        .mockResolvedValueOnce('Mitosis has four phases.')
      const chat = await openChat(complete)

      ask(chat, 'Explain mitosis')
      await waitFor(() => expect(chat.result.current.error).toBe('The AI is busy right now (rate limit).'))
      expect(chat.result.current.activeThread?.messages).toHaveLength(1)
      expect(chat.result.current.activeThread?.messages[0].failed).toBe(true)

      act(() => {
        chat.result.current.retry()
      })
      await waitFor(() => expect(messageCount(chat)).toBe(2))

      const messages = chat.result.current.activeThread?.messages ?? []
      expect(messages[0].failed).toBeFalsy()
      expect(messages[1].text).toBe('Mitosis has four phases.')
      expect(chat.result.current.error).toBeNull()
      expect(complete).toHaveBeenCalledTimes(2)
      // The question is sent once, not duplicated by the retry.
      const retried = complete.mock.calls[1][0].messages.filter((message) => message.role === 'user')
      expect(retried).toHaveLength(1)
    })

    it('does not send a failed message again when the learner asks something new', async () => {
      const complete = vi
        .fn<CompleteFn>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce('Here you go.')
      const chat = await openChat(complete)

      ask(chat, 'LOST QUESTION')
      await waitFor(() => expect(chat.result.current.error).toBe('offline'))
      ask(chat, 'second question')
      await waitFor(() => expect(messageCount(chat)).toBe(3))

      const sent = JSON.stringify(complete.mock.calls[1][0].messages)
      expect(sent).toContain('second question')
      expect(sent).not.toContain('LOST QUESTION')
    })

    it('offers Retry for a message interrupted by closing the tab', async () => {
      const storage = createMemoryStorage()
      const interrupted = appendMessage(createThread(), createUserMessage({ text: 'Half-sent question', images: [] }))
      await storage.save('u1', interrupted)
      const complete = vi.fn<CompleteFn>().mockResolvedValue('Here is the answer.')
      const chat = await openChat(complete, storage)

      expect(chat.result.current.activeThread?.messages[0].failed).toBe(true)

      act(() => {
        chat.result.current.retry()
      })
      await waitFor(() => expect(messageCount(chat)).toBe(2))
      expect(JSON.stringify(complete.mock.calls[0][0].messages)).toContain('Half-sent question')
    })
  })

  it('Stop cancels the request, marks the message failed and shows no error', async () => {
    const complete = vi.fn<CompleteFn>(
      ({ signal }) =>
        new Promise<string>((_, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })))
        }),
    )
    const chat = await openChat(complete)

    ask(chat, 'A slow question')
    await waitFor(() => expect(chat.result.current.isSending).toBe(true))
    act(() => {
      chat.result.current.stop()
    })
    await waitFor(() => expect(chat.result.current.isSending).toBe(false))

    expect(chat.result.current.activeThread?.messages[0].failed).toBe(true)
    expect(chat.result.current.error).toBeNull()
  })

  describe('persistence and memory', () => {
    it('remembers the earlier conversation after a reload', async () => {
      const storage = createMemoryStorage()
      const first = await openChat(vi.fn<CompleteFn>().mockResolvedValue('Volcanoes form at plate boundaries.'), storage)
      ask(first, 'How do volcanoes form?')
      await waitFor(() => expect(messageCount(first)).toBe(2))
      await waitForSaved(storage, 'u1', 2)
      first.unmount()

      const complete = vi.fn<CompleteFn>().mockResolvedValue('Because pressure builds up.')
      const second = await openChat(complete, storage)
      expect(second.result.current.threads).toHaveLength(1)
      expect(messageCount(second)).toBe(2)

      ask(second, 'Why do they erupt?')
      await waitFor(() => expect(messageCount(second)).toBe(4))

      const sent = JSON.stringify(complete.mock.calls[0][0].messages)
      expect(sent).toContain('How do volcanoes form?')
      expect(sent).toContain('Volcanoes form at plate boundaries.')
    })

    it('does not show one user’s chats to another user', async () => {
      const storage = createMemoryStorage()
      const first = await openChat(vi.fn<CompleteFn>().mockResolvedValue('Reply.'), storage, 'u1')
      ask(first, 'Private question')
      await waitFor(() => expect(messageCount(first)).toBe(2))
      await waitForSaved(storage, 'u1', 2)
      first.unmount()

      const other = await openChat(vi.fn<CompleteFn>(), storage, 'u2')
      expect(other.result.current.threads).toEqual([])
      expect(other.result.current.activeThread).toBeNull()
    })

    it('keeps separate chats separate', async () => {
      const complete = vi.fn<CompleteFn>().mockResolvedValue('Noted.')
      const chat = await openChat(complete)

      ask(chat, 'Tell me about volcanoes')
      await waitFor(() => expect(messageCount(chat)).toBe(2))
      const volcanoChat = chat.result.current.activeId as string

      act(() => {
        chat.result.current.newChat()
      })
      ask(chat, 'Solve this algebra problem')
      await waitFor(() => expect(messageCount(chat)).toBe(2))
      expect(JSON.stringify(complete.mock.calls[1][0].messages)).not.toContain('volcanoes')

      act(() => {
        chat.result.current.selectThread(volcanoChat)
      })
      ask(chat, 'And the crater?')
      await waitFor(() => expect(messageCount(chat)).toBe(4))
      const sent = JSON.stringify(complete.mock.calls[2][0].messages)
      expect(sent).toContain('volcanoes')
      expect(sent).not.toContain('algebra')
    })
  })
})
