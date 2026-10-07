import { describe, expect, it } from 'vitest'
import { buildContext, planCompaction } from './contextBuilder'
import type { ChatImage, ChatMessage, ChatThread } from './types'

function image(name: string): ChatImage {
  return { id: name, data: 'QUJD', mimeType: 'image/jpeg', width: 10, height: 10, name }
}

function message(
  index: number,
  role: ChatMessage['role'],
  text: string,
  options: { images?: ChatImage[]; failed?: boolean } = {},
): ChatMessage {
  return { id: `m${index}`, role, text, images: options.images ?? [], createdAt: index, failed: options.failed }
}

function thread(messages: ChatMessage[], extra: Partial<ChatThread> = {}): ChatThread {
  return { id: 't1', title: 'Chat', createdAt: 0, updatedAt: 0, messages, summary: '', summarizedCount: 0, ...extra }
}

/** Alternating learner/tutor messages that always end on a learner message (count must be odd). */
function longChat(count: number, size = 1200): ChatThread {
  return thread(
    Array.from({ length: count }, (_, index) =>
      message(index, index % 2 === 0 ? 'user' : 'assistant', `${index === 0 ? 'FIRST' : `msg${index}`} ${'x'.repeat(size)}`),
    ),
  )
}

describe('buildContext', () => {
  it('sends the whole chat, oldest first, when it fits', () => {
    const chat = thread([
      message(0, 'user', 'What is a cell?'),
      message(1, 'assistant', 'The basic unit of life.'),
      message(2, 'user', 'And a nucleus?'),
    ])
    const context = buildContext({ thread: chat })

    expect(context.windowStart).toBe(0)
    expect(context.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(context.messages[1].content).toBe('What is a cell?')
    expect(context.messages[3].content).toBe('And a nucleus?')
  })

  it('sends the newest images as base64 data URLs', () => {
    const chat = thread([message(0, 'user', 'What is this?', { images: [image('plant.jpg')] })])
    const content = buildContext({ thread: chat }).messages[1].content

    expect(Array.isArray(content)).toBe(true)
    expect(content).toEqual([
      { type: 'text', text: 'What is this?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ])
  })

  it('gives an image-only message a default prompt', () => {
    const chat = thread([message(0, 'user', '', { images: [image('a.jpg')] })])
    const content = buildContext({ thread: chat }).messages[1].content
    expect(content).toMatchObject([{ type: 'text', text: 'Please look at the attached image.' }, { type: 'image_url' }])
  })

  const withOldImage = () =>
    thread([
      message(0, 'user', 'Look at this', { images: [image('graph.jpg')] }),
      message(1, 'assistant', 'It shows a parabola.'),
      message(2, 'user', 'ok'),
      message(3, 'assistant', 'Any questions?'),
      message(4, 'user', 'What was the vertex?'),
    ])

  it('re-sends an earlier image while it is recent', () => {
    const context = buildContext({ thread: withOldImage(), limits: { imageMemoryMessages: 10 } })
    expect(Array.isArray(context.messages[1].content)).toBe(true)
    expect(context.imageCount).toBe(1)
  })

  it('replaces an older image with a note that points to the tutor reply', () => {
    const context = buildContext({ thread: withOldImage(), limits: { imageMemoryMessages: 2 } })
    expect(context.imageCount).toBe(0)
    expect(typeof context.messages[1].content).toBe('string')
    expect(context.messages[1].content).toContain('graph.jpg')
    expect(context.messages[1].content).toContain('was attached here earlier')
    // The tutor's description of the image is still sent.
    expect(JSON.stringify(context.messages)).toContain('It shows a parabola.')
  })

  it('never exceeds the images-per-request limit', () => {
    const chat = thread([
      message(0, 'user', 'first', { images: [image('a.jpg')] }),
      message(1, 'assistant', 'seen'),
      message(2, 'user', 'now two', { images: [image('b.jpg'), image('c.jpg')] }),
    ])
    const context = buildContext({ thread: chat })
    expect(context.imageCount).toBe(2)
    expect(typeof context.messages[1].content).toBe('string')
  })

  it('leaves failed messages out of the request', () => {
    const chat = thread([
      message(0, 'user', 'first question'),
      message(1, 'assistant', 'first answer'),
      message(2, 'user', 'LOST MESSAGE', { failed: true }),
      message(3, 'user', 'second question'),
    ])
    const sent = JSON.stringify(buildContext({ thread: chat }).messages)
    expect(sent).not.toContain('LOST MESSAGE')
    expect(sent).toContain('second question')
  })

  it('throws when there is no learner message to answer', () => {
    expect(() => buildContext({ thread: thread([]) })).toThrow('no message')
    const endsWithTutor = thread([message(0, 'user', 'hi'), message(1, 'assistant', 'hello')])
    expect(() => buildContext({ thread: endsWithTutor })).toThrow('no message')
  })

  it('adds the running summary to the system prompt and skips summarized messages', () => {
    const chat = thread(
      [
        message(0, 'user', 'OLD question'),
        message(1, 'assistant', 'OLD answer'),
        message(2, 'user', 'newer question'),
      ],
      { summary: 'The learner is studying photosynthesis.', summarizedCount: 2 },
    )
    const context = buildContext({ thread: chat })

    expect(context.messages[0].content).toContain('The learner is studying photosynthesis.')
    expect(context.windowStart).toBe(2)
    expect(JSON.stringify(context.messages.slice(1))).not.toContain('OLD')
  })

  it('shortens the window to fit the token budget and always keeps the newest message', () => {
    const chat = longChat(21)
    const context = buildContext({ thread: chat })

    expect(context.windowStart).toBeGreaterThan(0)
    expect(context.messages.length).toBeLessThan(22)
    expect(context.messages[1].role).toBe('user')
    const last = context.messages[context.messages.length - 1]
    expect(last.role).toBe('user')
    expect(String(last.content)).toContain('msg20')
  })

  it('only ever uses the messages of the chat it is given', () => {
    const a = thread([message(0, 'user', 'about volcanoes')])
    const b = thread([message(0, 'user', 'about algebra')])
    expect(JSON.stringify(buildContext({ thread: a }).messages)).not.toContain('algebra')
    expect(JSON.stringify(buildContext({ thread: b }).messages)).not.toContain('volcanoes')
  })
})

describe('planCompaction', () => {
  it('does nothing while the chat fits in one request', () => {
    expect(planCompaction({ thread: longChat(5, 100) })).toBeNull()
  })

  it('folds the oldest messages when the chat overflows, ending on a learner turn', () => {
    const chat = longChat(21)
    const plan = planCompaction({ thread: chat })

    expect(plan).not.toBeNull()
    expect(plan!.from).toBe(0)
    expect(plan!.to).toBeGreaterThan(0)
    expect(plan!.to).toBeLessThan(20)
    expect(chat.messages[plan!.to].role).toBe('user')
  })

  it('does not need to summarize again right after compacting', () => {
    const chat = longChat(21)
    const plan = planCompaction({ thread: chat })!
    const compacted = { ...chat, summary: 'Earlier topics.', summarizedCount: plan.to }

    expect(planCompaction({ thread: compacted })).toBeNull()
    expect(buildContext({ thread: compacted }).windowStart).toBe(plan.to)
  })

  it('keeps the very first messages reachable through the summary after many turns', () => {
    const chat = longChat(41)
    const first = planCompaction({ thread: chat })!
    const afterFirst = { ...chat, summary: 'S1', summarizedCount: first.to }
    const second = planCompaction({ thread: afterFirst })

    // Either the rest still fits, or the next plan continues exactly where the last one stopped.
    if (second) expect(second.from).toBe(first.to)
    const context = buildContext({ thread: second ? { ...afterFirst, summarizedCount: second.to } : afterFirst })
    expect(context.messages[0].content).toContain('S1')
  })
})
