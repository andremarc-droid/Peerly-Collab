import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'
import handler, { _resetFirebaseInitializedForTest } from './groupQuizzes.js'

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
const mockTestAction = vi.fn().mockResolvedValue({ success: true })
vi.mock('../functions/src/groupQuizzes.js', () => ({
  testAction: (...args: unknown[]) => mockTestAction(...args),
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

describe('api/groupQuizzes handler', () => {
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

  it('rejects missing Authorization header with 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: {},
      body: { action: 'testAction' },
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
      body: { action: 'testAction' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    expect(res.getResponseJson().code).toBe('functions/unauthenticated')
    expect(mockVerifyIdToken).toHaveBeenCalledWith('revoked-token', true)
  })

  it('rejects anonymous provider with 403', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'anon-123',
      firebase: { sign_in_provider: 'anonymous' },
    })
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer anon-token' },
      body: { action: 'testAction' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(403)
    expect(res.getResponseJson().code).toBe('functions/permission-denied')
    expect(res.getResponseJson().error).toContain('Anonymous accounts are not permitted')
  })

  it('authenticates valid non-anonymous token and passes decoded token to handler', async () => {
    const decodedToken = {
      uid: 'user-456',
      email: 'student@example.com',
      firebase: { sign_in_provider: 'password' },
    }
    mockVerifyIdToken.mockResolvedValueOnce(decodedToken)
    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'testAction', data: { test: 123 } },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(mockTestAction).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          uid: 'user-456',
          token: decodedToken,
        },
        data: { test: 123 },
      }),
    )
    expect(res.getResponseJson()).toEqual({ result: { success: true } })
  })

  it('falls back to non-revocation verification when service account lacks Identity Toolkit permission', async () => {
    const permErr = Object.assign(new Error('Identity Toolkit API has not been used in project before or it is disabled.'), {
      code: 'auth/insufficient-permission',
    })
    const decodedToken = {
      uid: 'instructor-1',
      firebase: { sign_in_provider: 'google.com' },
    }
    // First call (with true) fails with permission error; second call (with false) succeeds
    mockVerifyIdToken.mockRejectedValueOnce(permErr).mockResolvedValueOnce(decodedToken)

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token-perm' },
      body: { action: 'testAction', data: {} },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(200)
    expect(mockVerifyIdToken).toHaveBeenNthCalledWith(1, 'valid-token-perm', true)
    expect(mockVerifyIdToken).toHaveBeenNthCalledWith(2, 'valid-token-perm', false)
  })

  it('includes diagnostic reason code in 401 responses', async () => {
    const expiredErr = Object.assign(new Error('Firebase ID token has expired.'), {
      code: 'auth/id-token-expired',
    })
    mockVerifyIdToken.mockRejectedValueOnce(expiredErr)

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer expired-token' },
      body: { action: 'testAction' },
    })
    await handler(req, res)
    expect(res.statusCode).toBe(401)
    const json = res.getResponseJson()
    expect(json.code).toBe('functions/unauthenticated')
    expect(json.reason).toBe('token-expired')
  })

  it('does not return raw error messages for init/import failures in production', async () => {
    _resetFirebaseInitializedForTest()
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const { getApps, initializeApp } = await import('firebase-admin/app')
    vi.mocked(getApps).mockReturnValueOnce([])
    process.env.FIREBASE_SERVICE_ACCOUNT = 'invalid-secret-key-json'
    vi.mocked(initializeApp).mockImplementationOnce(() => {
      throw new Error('Sensitive internal crash details')
    })

    const { req, res } = createMockReqRes({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { action: 'testAction' },
    })

    await handler(req, res)
    expect(res.statusCode).toBe(500)
    const json = res.getResponseJson()
    expect(json.error).toBe('Failed to initialize the server service.')
    expect(json.error).not.toContain('Sensitive internal crash details')
    expect(json).not.toHaveProperty('details')
    process.env.NODE_ENV = originalEnv
    delete process.env.FIREBASE_SERVICE_ACCOUNT
  })
})
