import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getIdToken = vi.fn()
vi.mock('./auth', () => ({
  auth: { authStateReady: async () => undefined, currentUser: { uid: 'user-1', getIdToken: (...args: unknown[]) => getIdToken(...args) } },
}))
vi.mock('./functions', () => ({ functions: {} }))
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }))

import { callServer } from './callServer'

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: async () => body }) as unknown as Response

describe('callServer in the browser', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('VITE_USE_EMULATORS', 'false')
    vi.stubGlobal('fetch', fetchMock)
    getIdToken.mockResolvedValue('token-1')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    getIdToken.mockReset()
  })

  it('posts the action to the Vercel endpoint with the user token and returns the result', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { result: { success: true, optIn: true } }))
    const result = await callServer<{ optIn: boolean }, { success: boolean; optIn: boolean }>('updateScoreboardOptIn', { optIn: true })
    expect(result).toEqual({ success: true, optIn: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/appCallables')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'updateScoreboardOptIn', data: { optIn: true } })
  })

  it('turns a server error into an Error carrying a functions/ code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Invalid invite code. Group not found.', code: 'functions/not-found' }))
    await expect(callServer('joinStudyGroup', { inviteCode: 'ABCDEF' })).rejects.toMatchObject({
      message: 'Invalid invite code. Group not found.',
      code: 'functions/not-found',
    })
  })

  it('adds the functions/ prefix and falls back to internal when the server gives no code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: 'Nope', code: 'permission-denied' }))
    await expect(callServer('leaveStudyGroup', { groupId: 'g' })).rejects.toMatchObject({ code: 'functions/permission-denied' })
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}))
    await expect(callServer('leaveStudyGroup', { groupId: 'g' })).rejects.toMatchObject({ code: 'functions/internal', message: 'Something went wrong.' })
  })

  it('refreshes the token once and retries after a 401', async () => {
    getIdToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh')
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Authentication failed. Please sign in again.', code: 'functions/unauthenticated' }))
      .mockResolvedValueOnce(jsonResponse(200, { result: { ok: true } }))
    await expect(callServer('ensureScoreboardEntry', undefined)).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(((fetchMock.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer fresh')
  })
})
