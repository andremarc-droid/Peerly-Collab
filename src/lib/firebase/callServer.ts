import { Capacitor } from '@capacitor/core'
import { httpsCallable } from 'firebase/functions'
import { auth } from './auth'
import { functions } from './functions'

/**
 * Calls a trusted server action (scoreboard, study groups, public decks).
 *
 * In the browser the request goes to the Vercel endpoint `/api/appCallables`, which verifies the Firebase ID token and runs
 * the same handler code as `functions/src`. Direct `httpsCallable` calls to cloudfunctions.net only work when those
 * Cloud Functions are deployed, and fail with a CORS error otherwise, so they are used only by tests and the emulator.
 * Group quizzes use the same approach (see `teamService.ts` and `api/groupQuizzes.ts`).
 */
function apiEndpoint(): string {
  const custom = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (custom) return `${custom}/api/appCallables`
  if (Capacitor.isNativePlatform() || (typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || (window.location.hostname === 'localhost' && window.location.port === '')))) {
    return 'https://peerly-collab.vercel.app/api/appCallables'
  }
  return '/api/appCallables'
}

function send(action: string, data: unknown, token: string | undefined): Promise<Response> {
  return fetch(apiEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, data }),
  })
}

export async function callServer<I, O>(action: string, data: I): Promise<O> {
  if (import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_EMULATORS === 'true') {
    return httpsCallable<I, O>(functions, action)(data).then(result => result.data)
  }
  if (typeof auth.authStateReady === 'function') await auth.authStateReady()
  let token = await auth.currentUser?.getIdToken()
  if (!token && auth.currentUser) token = await auth.currentUser.getIdToken(true).catch(() => undefined)

  let response = await send(action, data, token)
  // A 401 usually means an expired token: refresh it once and retry.
  if (response.status === 401 && auth.currentUser) {
    const fresh = await auth.currentUser.getIdToken(true).catch(() => undefined)
    if (fresh && fresh !== token) response = await send(action, data, fresh)
  }

  let json: Record<string, unknown> = {}
  try {
    json = (await response.json()) as Record<string, unknown>
  } catch {
    json = { error: `HTTP ${response.status} ${response.statusText}` }
  }
  if (!response.ok) {
    const message = (typeof json.error === 'string' && json.error) || (typeof json.message === 'string' && json.message) || 'Something went wrong.'
    const error = new Error(message)
    const rawCode = typeof json.code === 'string' ? json.code : ''
    ;(error as { code?: string }).code = rawCode.startsWith('functions/') ? rawCode : rawCode ? `functions/${rawCode}` : 'functions/internal'
    ;(error as { status?: number }).status = response.status
    throw error
  }
  return json.result as O
}
