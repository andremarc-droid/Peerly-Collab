import { describe, expect, it, vi } from 'vitest'
import type { CompleteFn } from '../../lib/groq/client'
import { MAX_OUTPUT_TOKENS } from './constants'
import { generateReply } from './engine'
import { makeLongChat, makeMessage, makeThread } from './testFactories'

function textOf(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content)
}

describe('generateReply', () => {
  it('sends the chat and appends the tutor reply without changing the input', async () => {
    const chat = makeThread([makeMessage(0, 'user', 'What is a cell?')])
    const complete = vi.fn<CompleteFn>().mockResolvedValue('The basic unit of life.')

    const updated = await generateReply({ thread: chat, complete })

    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0].maxTokens).toBe(MAX_OUTPUT_TOKENS)
    expect(updated.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'What is a cell?'],
      ['assistant', 'The basic unit of life.'],
    ])
    expect(chat.messages).toHaveLength(1)
  })

  it('tells the tutor which class the learner is looking at', async () => {
    const chat = makeThread([makeMessage(0, 'user', 'Help')])
    const complete = vi.fn<CompleteFn>().mockResolvedValue('Sure.')

    await generateReply({ thread: chat, classLabel: 'Biology 101', complete })

    expect(textOf(complete.mock.calls[0][0].messages[0].content)).toContain('Biology 101')
  })

  it('passes the abort signal to the request', async () => {
    const controller = new AbortController()
    const complete = vi.fn<CompleteFn>().mockResolvedValue('ok')

    await generateReply({ thread: makeThread([makeMessage(0, 'user', 'hi')]), signal: controller.signal, complete })

    expect(complete.mock.calls[0][0].signal).toBe(controller.signal)
  })

  it('summarizes the oldest messages first when the chat is too long, then answers with that summary', async () => {
    const chat = makeLongChat(21)
    const complete = vi
      .fn<CompleteFn>()
      .mockResolvedValueOnce('The learner is studying cells.')
      .mockResolvedValueOnce('Final tutor reply.')
    const onThreadChange = vi.fn()

    const updated = await generateReply({ thread: chat, complete, onThreadChange })

    expect(complete).toHaveBeenCalledTimes(2)
    const [summaryRequest, replyRequest] = complete.mock.calls.map(([options]) => options)
    expect(textOf(summaryRequest.messages[0].content)).toContain('running summary')
    expect(textOf(summaryRequest.messages[1].content)).toContain('FIRST')
    expect(textOf(replyRequest.messages[0].content)).toContain('The learner is studying cells.')

    expect(onThreadChange).toHaveBeenCalledTimes(1)
    expect(onThreadChange.mock.calls[0][0].summary).toBe('The learner is studying cells.')
    expect(updated.summary).toBe('The learner is studying cells.')
    expect(updated.summarizedCount).toBeGreaterThan(0)
    expect(updated.messages).toHaveLength(22)
    expect(updated.messages[21].text).toBe('Final tutor reply.')
    expect(chat.summary).toBe('')
  })

  it('reports summary progress even when the reply then fails, so Retry does not redo it', async () => {
    const chat = makeLongChat(21)
    const complete = vi
      .fn<CompleteFn>()
      .mockResolvedValueOnce('Saved summary.')
      .mockRejectedValueOnce(new Error('network down'))
    const onThreadChange = vi.fn()

    await expect(generateReply({ thread: chat, complete, onThreadChange })).rejects.toThrow('network down')

    expect(onThreadChange).toHaveBeenCalledTimes(1)
    expect(onThreadChange.mock.calls[0][0].summary).toBe('Saved summary.')
    expect(chat.messages).toHaveLength(21)
  })

  it('reports nothing when the summary itself fails', async () => {
    const complete = vi.fn<CompleteFn>().mockRejectedValue(new Error('rate limited'))
    const onThreadChange = vi.fn()

    await expect(generateReply({ thread: makeLongChat(21), complete, onThreadChange })).rejects.toThrow('rate limited')

    expect(onThreadChange).not.toHaveBeenCalled()
  })

  it('refuses to run when the learner has not asked anything', async () => {
    const complete = vi.fn<CompleteFn>()
    const answered = makeThread([makeMessage(0, 'user', 'hi'), makeMessage(1, 'assistant', 'hello')])

    await expect(generateReply({ thread: answered, complete })).rejects.toThrow('no message')
    expect(complete).not.toHaveBeenCalled()
  })
})
