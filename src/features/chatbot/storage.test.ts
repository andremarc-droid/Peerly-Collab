import { afterEach, describe, expect, it, vi } from 'vitest'
import { HARD_CAP_BASE64_LENGTH } from '../canvas/imageProcessing'
import { parseThread } from './parseThread'
import { createChatStorage, createMemoryStorage } from './storage'
import { makeImage, makeMessage, makeThread } from './testFactories'

/** What a chat looks like after being written to storage and read back. */
function stored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('parseThread', () => {
  const valid = () =>
    stored(
      makeThread(
        [makeMessage(0, 'user', 'look', { images: [makeImage('a.jpg')] }), makeMessage(1, 'assistant', 'I see a leaf')],
        { summary: 'Earlier: leaves.', summarizedCount: 1 },
      ),
    ) as Record<string, unknown>

  it('accepts a valid chat unchanged', () => {
    const thread = parseThread(valid())
    expect(thread?.messages).toHaveLength(2)
    expect(thread?.messages[0].images[0].data).toBe('QUJD')
    expect(thread?.summary).toBe('Earlier: leaves.')
    expect(thread?.summarizedCount).toBe(1)
  })

  it('rejects values that are not chats', () => {
    expect(parseThread(null)).toBeNull()
    expect(parseThread('chat')).toBeNull()
    expect(parseThread([])).toBeNull()
    expect(parseThread({ ...valid(), id: 7 })).toBeNull()
    expect(parseThread({ ...valid(), messages: 'nope' })).toBeNull()
    expect(parseThread({ ...valid(), createdAt: 'yesterday' })).toBeNull()
  })

  it('drops malformed messages but keeps the valid ones', () => {
    const raw = valid()
    raw.messages = [...(raw.messages as unknown[]), 'junk', { id: 'x' }, { id: 'y', role: 'system', text: 't', createdAt: 1 }]
    expect(parseThread(raw)?.messages).toHaveLength(2)
  })

  it('drops images with a wrong type, invalid base64 or too much data', () => {
    const good = stored(makeImage('good.jpg')) as Record<string, unknown>
    const raw = valid()
    raw.messages = [
      {
        id: 'm0',
        role: 'user',
        text: 'pics',
        createdAt: 0,
        images: [
          { ...good, id: 'png', mimeType: 'image/png' },
          { ...good, id: 'bad', data: 'not base64!' },
          { ...good, id: 'big', data: 'A'.repeat(HARD_CAP_BASE64_LENGTH + 4) },
          good,
        ],
      },
    ]
    const images = parseThread(raw)?.messages[0].images ?? []
    expect(images.map((image) => image.name)).toEqual(['good.jpg'])
  })

  it('never keeps images on tutor messages', () => {
    const raw = valid()
    raw.messages = [
      { id: 'm0', role: 'user', text: 'q', createdAt: 0, images: [] },
      { id: 'm1', role: 'assistant', text: 'a', createdAt: 1, images: [stored(makeImage('x.jpg'))] },
    ]
    expect(parseThread(raw)?.messages[1].images).toEqual([])
  })

  it('keeps the failed flag only when it is exactly true', () => {
    const raw = valid()
    raw.messages = [
      { id: 'm0', role: 'user', text: 'a', createdAt: 0, images: [], failed: true },
      { id: 'm1', role: 'user', text: 'b', createdAt: 1, images: [], failed: 'yes' },
    ]
    const messages = parseThread(raw)?.messages ?? []
    expect(messages[0].failed).toBe(true)
    expect('failed' in messages[1]).toBe(false)
  })

  it('keeps the summary count inside the message list', () => {
    expect(parseThread({ ...valid(), summarizedCount: 99 })?.summarizedCount).toBe(2)
    expect(parseThread({ ...valid(), summarizedCount: -4 })?.summarizedCount).toBe(0)
    expect(parseThread({ ...valid(), summarizedCount: 'x' })?.summarizedCount).toBe(0)
    expect(parseThread({ ...valid(), summarizedCount: 1.7 })?.summarizedCount).toBe(1)
    expect(parseThread({ ...valid(), summary: 42 })?.summary).toBe('')
  })

  it('limits the title length and falls back to a default', () => {
    expect(parseThread({ ...valid(), title: '' })?.title).toBe('New chat')
    expect(parseThread({ ...valid(), title: 'a'.repeat(200) })?.title).toHaveLength(120)
  })
})

describe('chat storage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips a chat with its summary and base64 images', async () => {
    const storage = createMemoryStorage()
    const chat = makeThread(
      [makeMessage(0, 'user', 'look', { images: [makeImage('a.jpg')] }), makeMessage(1, 'assistant', 'I see')],
      { summary: 'S', summarizedCount: 0 },
    )
    await storage.save('u1', chat)

    const [loaded] = await storage.load('u1')
    expect(loaded.messages.map((message) => message.text)).toEqual(['look', 'I see'])
    expect(loaded.messages[0].images[0].data).toBe('QUJD')
    expect(loaded.summary).toBe('S')
  })

  it('keeps each user’s chats separate', async () => {
    const storage = createMemoryStorage()
    await storage.save('u1', makeThread([makeMessage(0, 'user', 'mine')], { id: 'a' }))
    await storage.save('u10', makeThread([makeMessage(0, 'user', 'theirs')], { id: 'b' }))

    expect((await storage.load('u1')).map((thread) => thread.id)).toEqual(['a'])
    expect((await storage.load('u10')).map((thread) => thread.id)).toEqual(['b'])
    expect(await storage.load('nobody')).toEqual([])
  })

  it('updates a saved chat instead of duplicating it, and removes it on delete', async () => {
    const storage = createMemoryStorage()
    await storage.save('u1', makeThread([makeMessage(0, 'user', 'one')]))
    await storage.save('u1', makeThread([makeMessage(0, 'user', 'one'), makeMessage(1, 'assistant', 'two')]))

    const loaded = await storage.load('u1')
    expect(loaded).toHaveLength(1)
    expect(loaded[0].messages).toHaveLength(2)

    await storage.remove('u1', 't1')
    expect(await storage.load('u1')).toEqual([])
  })

  it('marks a message that never got a reply as failed when loading', async () => {
    const storage = createMemoryStorage()
    await storage.save('u1', makeThread([makeMessage(0, 'user', 'closed the tab too soon')]))
    const [loaded] = await storage.load('u1')
    expect(loaded.messages[0].failed).toBe(true)
  })

  it('falls back to in-memory storage when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const storage = createChatStorage()
    await storage.save('u1', makeThread([makeMessage(0, 'user', 'q'), makeMessage(1, 'assistant', 'a')]))
    expect(await storage.load('u1')).toHaveLength(1)
  })
})
