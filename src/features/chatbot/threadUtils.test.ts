import { describe, expect, it } from 'vitest'
import { makeImage, makeMessage, makeThread } from './testFactories'
import {
  appendMessage,
  createAssistantMessage,
  createThread,
  createUserMessage,
  deriveTitle,
  findLastUserMessage,
  recoverInterrupted,
  setMessageFailed,
  sortThreads,
  threadsToPrune,
} from './threadUtils'

describe('deriveTitle', () => {
  it('collapses whitespace', () => {
    expect(deriveTitle('  What   is\na cell?  ', 0)).toBe('What is a cell?')
  })

  it('shortens long titles to 48 characters with an ellipsis', () => {
    const title = deriveTitle('a'.repeat(60), 0)
    expect(title).toHaveLength(48)
    expect(title.endsWith('…')).toBe(true)
    expect(deriveTitle('b'.repeat(48), 0)).toBe('b'.repeat(48))
  })

  it('names image-only chats and falls back for empty ones', () => {
    expect(deriveTitle('', 1)).toBe('Image question')
    expect(deriveTitle('   ', 0)).toBe('New chat')
  })
})

describe('thread helpers', () => {
  it('creates an empty chat', () => {
    expect(createThread(5, () => 'id-1')).toEqual({
      id: 'id-1',
      title: 'New chat',
      createdAt: 5,
      updatedAt: 5,
      messages: [],
      summary: '',
      summarizedCount: 0,
    })
  })

  it('names the chat after the first learner message only', () => {
    const empty = createThread(0, () => 't')
    const first = appendMessage(empty, createUserMessage({ text: 'What is osmosis?', images: [] }, 10, () => 'm1'))
    const reply = appendMessage(first, createAssistantMessage('Water moving across a membrane.', 20, () => 'm2'))
    const next = appendMessage(reply, createUserMessage({ text: 'A different question', images: [] }, 30, () => 'm3'))

    expect(first.title).toBe('What is osmosis?')
    expect(reply.title).toBe('What is osmosis?')
    expect(next.title).toBe('What is osmosis?')
    expect(next.updatedAt).toBe(30)
    expect(next.messages).toHaveLength(3)
    expect(empty.messages).toHaveLength(0)
  })

  it('does not name a chat from a tutor message, and names image-only chats', () => {
    const empty = createThread(0, () => 't')
    expect(appendMessage(empty, createAssistantMessage('Hi', 1, () => 'a')).title).toBe('New chat')
    const withImage = createUserMessage({ text: '', images: [makeImage('a.jpg')] }, 1, () => 'u')
    expect(appendMessage(empty, withImage).title).toBe('Image question')
  })

  it('marks only the chosen message as failed', () => {
    const chat = makeThread([makeMessage(0, 'user', 'a'), makeMessage(1, 'user', 'b')])
    const failed = setMessageFailed(chat, 'm0', true)
    expect(failed.messages[0].failed).toBe(true)
    expect(failed.messages[1].failed).toBeUndefined()
    expect(setMessageFailed(failed, 'm0', false).messages[0].failed).toBe(false)
  })

  it('finds the last learner message', () => {
    const chat = makeThread([
      makeMessage(0, 'user', 'first'),
      makeMessage(1, 'assistant', 'answer'),
      makeMessage(2, 'user', 'second'),
      makeMessage(3, 'assistant', 'answer 2'),
    ])
    expect(findLastUserMessage(chat)?.id).toBe('m2')
    expect(findLastUserMessage(makeThread([]))).toBeUndefined()
  })
})

describe('recoverInterrupted', () => {
  it('marks a trailing unanswered learner message as failed so Retry shows', () => {
    const recovered = recoverInterrupted(makeThread([makeMessage(0, 'user', 'question')]))
    expect(recovered.messages[0].failed).toBe(true)
  })

  it('leaves answered, already failed and empty chats untouched', () => {
    const answered = makeThread([makeMessage(0, 'user', 'q'), makeMessage(1, 'assistant', 'a')])
    const alreadyFailed = makeThread([makeMessage(0, 'user', 'q', { failed: true })])
    const empty = makeThread([])
    expect(recoverInterrupted(answered)).toBe(answered)
    expect(recoverInterrupted(alreadyFailed)).toBe(alreadyFailed)
    expect(recoverInterrupted(empty)).toBe(empty)
  })
})

describe('sorting and pruning', () => {
  const threads = [
    makeThread([], { id: 'a', updatedAt: 1 }),
    makeThread([], { id: 'b', updatedAt: 3 }),
    makeThread([], { id: 'c', updatedAt: 2 }),
  ]

  it('sorts newest first without changing the input', () => {
    expect(sortThreads(threads).map((thread) => thread.id)).toEqual(['b', 'c', 'a'])
    expect(threads.map((thread) => thread.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the oldest chats beyond the maximum', () => {
    expect(threadsToPrune(threads, 2)).toEqual(['a'])
    expect(threadsToPrune(threads, 5)).toEqual([])
    expect(threadsToPrune(threads, 0)).toEqual(['b', 'c', 'a'])
  })
})
