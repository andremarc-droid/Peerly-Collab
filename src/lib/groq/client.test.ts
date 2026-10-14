import { describe, expect, it, vi } from 'vitest'
import { createChatCompletion, getAiChatEndpoint, GroqError, stripThinking, type GroqFetch } from './client'

const config = { model: 'qwen/qwen3.8-27b' }
const messages = [{ role: 'user' as const, content: 'Hi' }]

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })
}

describe('stripThinking', () => {
  it('removes complete and unfinished think blocks', () => {
    expect(stripThinking('<think>plan</think>Answer')).toBe('Answer')
    expect(stripThinking('Answer<think>never closed')).toBe('Answer')
    expect(stripThinking('  plain  ')).toBe('plain')
  })
})

describe('getAiChatEndpoint', () => {
  it('returns /api/aiChat in standard web mode', () => {
    expect(getAiChatEndpoint()).toBe('/api/aiChat')
  })
})

describe('createChatCompletion', () => {
  it('posts the request to /api/aiChat with instruct mode for qwen', async () => {
    const fetchImpl = vi.fn<GroqFetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'Hello' } }] }))
    const reply = await createChatCompletion({ messages, config, fetchImpl })

    expect(reply).toBe('Hello')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/aiChat')
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('qwen/qwen3.8-27b')
    expect(body.reasoning_effort).toBe('none')
    expect(body.messages).toEqual(messages)
  })

  it('does not send reasoning_effort for non-qwen models', async () => {
    const fetchImpl = vi.fn<GroqFetch>().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    await createChatCompletion({ messages, config: { ...config, model: 'openai/gpt-oss-20b' }, fetchImpl })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body as string)).not.toHaveProperty('reasoning_effort')
  })

  it('explains rate limits with the retry delay', async () => {
    const fetchImpl: GroqFetch = async () =>
      jsonResponse({ error: { message: 'slow down' } }, { status: 429, headers: { 'retry-after': '12' } })
    const error = await createChatCompletion({ messages, config, fetchImpl }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GroqError)
    expect((error as GroqError).status).toBe(429)
    expect((error as GroqError).retryAfterSeconds).toBe(12)
    expect((error as GroqError).message).toContain('12 seconds')
  })

  it('reports authentication error without leaking keys', async () => {
    const fetchImpl: GroqFetch = async () => jsonResponse({}, { status: 401 })
    const error = (await createChatCompletion({ messages, config, fetchImpl }).catch((e: unknown) => e)) as GroqError
    expect(error.message).toContain('Authentication failed')
    expect(error.message).not.toContain('API key')
  })

  it('includes the provider detail for bad requests', async () => {
    const fetchImpl: GroqFetch = async () => jsonResponse({ error: { message: 'bad image' } }, { status: 400 })
    const error = (await createChatCompletion({ messages, config, fetchImpl }).catch((e: unknown) => e)) as GroqError
    expect(error.message).toContain('bad image')
  })

  it('turns network failures into a friendly error but lets aborts through', async () => {
    const offline: GroqFetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(createChatCompletion({ messages, config, fetchImpl: offline })).rejects.toThrow('Could not reach')

    const aborted: GroqFetch = async () => {
      throw new DOMException('Aborted', 'AbortError')
    }
    await expect(createChatCompletion({ messages, config, fetchImpl: aborted })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects empty replies', async () => {
    const fetchImpl: GroqFetch = async () => jsonResponse({ choices: [{ message: { content: '<think>x</think>' } }] })
    await expect(createChatCompletion({ messages, config, fetchImpl })).rejects.toThrow('empty reply')
  })
})
