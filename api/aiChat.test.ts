import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler, { checkUserRateLimit } from './aiChat.js'

const mockVerifyIdToken = vi.fn()
vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn(() => [{ name: '[DEFAULT]' }]),
  initializeApp: vi.fn(),
  cert: vi.fn(),
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}))

const firestoreStore = new Map<string, Record<string, unknown>>()
const mockRunTransaction = vi.fn(async (updateFunction: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    get: async (ref: { path: string }) => {
      const data = firestoreStore.get(ref.path)
      return {
        exists: !!data,
        get: (field: string) => data?.[field],
        data: () => data,
      }
    },
    set: (ref: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => {
      if (options?.merge && firestoreStore.has(ref.path)) {
        firestoreStore.set(ref.path, { ...firestoreStore.get(ref.path), ...data })
      } else {
        firestoreStore.set(ref.path, data)
      }
    },
  }
  return updateFunction(tx)
})
const mockDoc = vi.fn((path: string) => ({ path }))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: mockDoc,
    runTransaction: mockRunTransaction,
  })),
}))

function createMockReqRes(options: {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}) {
  const req = {
    method: options.method ?? 'POST',
    headers: options.headers ?? {},
    body: options.body,
    on: vi.fn(),
  } as unknown as IncomingMessage & { body?: unknown }

  let statusCode = 200
  const headers: Record<string, string> = {}
  let responseData = ''

  const res = {
    get statusCode() {
      return statusCode
    },
    set statusCode(code: number) {
      statusCode = code
    },
    setHeader: vi.fn((key: string, val: string) => {
      headers[key] = val
    }),
    end: vi.fn((data?: string) => {
      if (data) responseData += data
    }),
  } as unknown as ServerResponse & { getResponseJson: () => Record<string, unknown> }

  res.getResponseJson = () => (responseData ? JSON.parse(responseData) : {})

  return { req, res }
}

describe('api/aiChat handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreStore.clear()
    process.env.GROQ_API_KEY = 'test-server-key'
    mockVerifyIdToken.mockResolvedValue({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
  })

  it('handles OPTIONS preflight with 204', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' })
    await handler(req, res)
    expect(res.statusCode).toBe(204)
  })

  it('rejects non-POST with 405', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req, res)
    expect(res.statusCode).toBe(405)
  })

  it('rejects missing token with 401', async () => {
    const { req, res } = createMockReqRes({ method: 'POST', headers: {} })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects anonymous accounts with 403', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'anon-uid',
      firebase: { sign_in_provider: 'anonymous' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer anon-token' },
      body: { messages: [{ role: 'user', content: 'hello' }] },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(403)
  })

  it('enforces per-user rate limit', async () => {
    const uid = 'rate-limit-test-user'
    const now = 100000
    for (let i = 0; i < 30; i++) {
      expect((await checkUserRateLimit(uid, now)).allowed).toBe(true)
    }
    const check = await checkUserRateLimit(uid, now)
    expect(check.allowed).toBe(false)
    expect(check.retryAfter).toBeGreaterThan(0)

    // After window passes, rate limit resets
    const nextCheck = await checkUserRateLimit(uid, now + 60_001)
    expect(nextCheck.allowed).toBe(true)
  })

  it('proxies request to Groq and returns formatted response', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        choices: [{ message: { content: '<think>some reasoning</think>Final answer' } }],
      }),
      text: async () => '',
    } as unknown as Response)

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        messages: [{ role: 'user', content: 'What is biology?' }],
      },
    })

    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.getResponseJson().text).toBe('Final answer')
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-server-key',
        }),
      }),
    )
    fetchSpy.mockRestore()
  })

  it('rejects disallowed models with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        model: 'some-unsupported/model',
        messages: [{ role: 'user', content: 'hello' }],
      },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.getResponseJson().error).toMatch(/model/i)
  })

  it('rejects messages count exceeding cap with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const manyMessages = Array.from({ length: 51 }, (_, i) => ({
      role: 'user' as const,
      content: `msg ${i}`,
    }))
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { messages: manyMessages },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid message roles and content with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        messages: [{ role: 'hacker', content: 'hello' }],
      },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects total character count exceeding cap with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        messages: [{ role: 'user', content: 'a'.repeat(1_500_001) }],
      },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid max_tokens with 400', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: {
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5000,
      },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('does not fall back to VITE_GROQ_API_KEY when GROQ_API_KEY is missing and removes details on 500', async () => {
    delete process.env.GROQ_API_KEY
    process.env.VITE_GROQ_API_KEY = 'should-not-be-used'
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'valid-user',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { messages: [{ role: 'user', content: 'hello' }] },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(500)
    const json = res.getResponseJson()
    expect(json.code).toBe('server/not-configured')
    expect(json).not.toHaveProperty('details')
    delete process.env.VITE_GROQ_API_KEY
  })
})
