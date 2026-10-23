import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler, { APP_CALLABLE_ACTIONS } from './appCallables.js'
import { HttpsError } from 'firebase-functions/v2/https'

// Mock firebase-admin/app and firebase-admin/auth
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

// Mock handlers
const mockUpdateScoreboardOptIn = vi.fn().mockResolvedValue({ success: true, optIn: true })
const mockEnsureScoreboardEntry = vi.fn().mockResolvedValue({ optIn: true, created: false })

vi.mock('../functions/src/scoreboard.js', () => ({
  updateScoreboardOptInHandler: (...args: unknown[]) => mockUpdateScoreboardOptIn(...args),
  ensureScoreboardEntryHandler: (...args: unknown[]) => mockEnsureScoreboardEntry(...args),
}))

vi.mock('../functions/src/studyGroups.js', () => ({
  joinStudyGroupHandler: vi.fn(),
  leaveStudyGroupHandler: vi.fn(),
  removeStudyGroupMemberHandler: vi.fn(),
}))

vi.mock('../functions/src/publicDecks.js', () => ({
  savePublicDeckHandler: vi.fn(),
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

describe('api/appCallables handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles OPTIONS preflight with 204', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' })
    await handler(req, res)
    expect(res.statusCode).toBe(204)
    expect(res.end).toHaveBeenCalled()
  })

  it('rejects non-POST requests with 405', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' })
    await handler(req, res)
    expect(res.statusCode).toBe(405)
    expect(res.getResponseJson()).toEqual({ error: 'Method Not Allowed' })
  })

  it('rejects unknown actions with 400', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: { action: 'unknownAction' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.getResponseJson().error).toBe('Unknown action: unknownAction')
  })

  it('rejects missing Authorization header with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: {},
      body: { action: 'updateScoreboardOptIn' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.getResponseJson().code).toBe('functions/unauthenticated')
  })

  it('rejects empty Bearer token with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer   ' },
      body: { action: 'updateScoreboardOptIn' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.getResponseJson().code).toBe('functions/unauthenticated')
  })

  it('rejects revoked or invalid token with 401', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Firebase ID token has been revoked.'))
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer revoked-token' },
      body: { action: 'updateScoreboardOptIn' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.getResponseJson().code).toBe('functions/unauthenticated')
  })

  it('rejects anonymous token with 403', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'anon-1',
      firebase: { sign_in_provider: 'anonymous' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer anon-token' },
      body: { action: 'updateScoreboardOptIn' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(403)
    expect(res.getResponseJson().code).toBe('functions/permission-denied')
  })

  it('runs allow-listed actions successfully and passes caller data', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'user-123',
      name: 'Ada',
      firebase: { sign_in_provider: 'google.com' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'updateScoreboardOptIn', data: { optIn: true, displayName: 'Ada' } },
    })

    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.getResponseJson()).toEqual({ result: { success: true, optIn: true } })
    expect(mockUpdateScoreboardOptIn).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ uid: 'user-123' }),
        data: { optIn: true, displayName: 'Ada' },
      }),
    )
  })

  it('maps HttpsError invalid-argument to status 400 and returns the error message', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'user-123',
      firebase: { sign_in_provider: 'google.com' },
    })
    mockUpdateScoreboardOptIn.mockRejectedValueOnce(
      new HttpsError('invalid-argument', 'Display name must be at least 2 characters.'),
    )

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'updateScoreboardOptIn', data: { optIn: true, displayName: 'a' } },
    })

    await handler(req, res)
    expect(res.statusCode).toBe(400)
    const json = res.getResponseJson()
    expect(json.error).toBe('Display name must be at least 2 characters.')
    expect(json.code).toBe('functions/invalid-argument')
  })

  it('maps internal error to 500 without leaking stack traces in production', async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      mockVerifyIdToken.mockResolvedValueOnce({
        uid: 'user-123',
        firebase: { sign_in_provider: 'google.com' },
      })
      mockUpdateScoreboardOptIn.mockRejectedValueOnce(
        new Error('Database connection secret /internal/cluster:password failed'),
      )

      const { req, res } = createMockReqRes({
        method: 'POST',
        headers: { authorization: 'Bearer valid-token' },
        body: { action: 'updateScoreboardOptIn', data: { optIn: true } },
      })

      await handler(req, res)
      expect(res.statusCode).toBe(500)
      const json = res.getResponseJson()
      expect(json.error).toBe('Something went wrong.')
      expect(json.code).toBe('functions/internal')
      expect(json.details).toBeUndefined()
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })

  it('exposes only the designated allow-listed actions in APP_CALLABLE_ACTIONS', () => {
    expect(APP_CALLABLE_ACTIONS).toEqual([
      'updateScoreboardOptIn',
      'ensureScoreboardEntry',
      'joinStudyGroup',
      'leaveStudyGroup',
      'removeStudyGroupMember',
      'savePublicDeck',
    ])
  })
})
