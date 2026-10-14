import type { IncomingMessage, ServerResponse } from 'http'

import type { DecodedIdToken } from 'firebase-admin/auth'

// Lazy loaded singletons
let firebaseInitialized = false
let handlersCache: Record<string, unknown> | null = null
let currentProjectId = 'collaboration-app-b3c91'

async function getHandlers() {
  if (!handlersCache) {
    handlersCache = (await import('../functions/src/groupQuizzes.js')) as unknown as Record<string, unknown>
  }
  return handlersCache
}

async function ensureFirebase() {
  if (firebaseInitialized) return
  const { getApps, initializeApp, cert } = await import('firebase-admin/app')
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing on Vercel.')
    }
    let clean = raw
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim()
    }
    try {
      const jsonStr = clean.startsWith('{') ? clean : Buffer.from(clean, 'base64').toString('utf-8')
      const credentials = JSON.parse(jsonStr) as Record<string, unknown>
      if (typeof credentials.project_id === 'string' && credentials.project_id) {
        currentProjectId = credentials.project_id
      }
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
      }
      initializeApp({ credential: cert(credentials) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err)
      throw new Error(`FIREBASE_SERVICE_ACCOUNT invalid: ${msg}`)
    }
  }
  firebaseInitialized = true
}

async function verifyFirebaseToken(token: string): Promise<DecodedIdToken> {
  const { getAuth } = await import('firebase-admin/auth')
  const decodedToken = await getAuth().verifyIdToken(token, true)
  if (decodedToken.firebase?.sign_in_provider === 'anonymous') {
    const err = new Error('Anonymous accounts are not permitted for group quizzes.')
    ;(err as unknown as { code: string }).code = 'auth/anonymous-not-allowed'
    throw err
  }
  return decodedToken
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data) as Record<string, unknown>)
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    return
  }

  let phase = 'start'
  try {
    phase = 'initFirebase'
    await ensureFirebase()

    phase = 'importHandlers'
    const handlers = await getHandlers()

    phase = 'parseBody'
    let body = req.body as Record<string, unknown> | string | undefined
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as Record<string, unknown>
      } catch {
        body = undefined
      }
    }
    if (!body || typeof body !== 'object') {
      body = await parseBody(req)
    }
    const action = typeof body?.action === 'string' ? body.action : ''
    const data = body?.data

    const isDev = process.env.NODE_ENV !== 'production'
    const authHeader = req.headers.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: 'Missing Authorization header. Please sign in.',
        code: 'functions/unauthenticated',
        ...(isDev ? { phase: 'verifyAuth', details: 'No Bearer token provided in request headers.' } : {}),
      }))
      return
    }

    const token = authHeader.substring(7).trim()
    if (!token) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: 'Empty Bearer token provided.',
        code: 'functions/unauthenticated',
        ...(isDev ? { phase: 'verifyAuth', details: 'Bearer token string was empty.' } : {}),
      }))
      return
    }

    let decodedToken: DecodedIdToken
    try {
      decodedToken = await verifyFirebaseToken(token)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Invalid, revoked, or anonymous ID token provided:', msg)
      const isAnon = (err as unknown as { code?: string }).code === 'auth/anonymous-not-allowed'
      res.statusCode = isAnon ? 403 : 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: isAnon ? 'Anonymous accounts are not permitted for group quizzes.' : 'Authentication failed. Please sign in again.',
        code: isAnon ? 'functions/permission-denied' : 'functions/unauthenticated',
        ...(isDev ? { phase: 'verifyAuth', details: msg } : {}),
      }))
      return
    }

    phase = 'findAction'
    const handlerFn = handlers[action] as ((call: unknown) => Promise<unknown>) | undefined
    if (typeof handlerFn !== 'function') {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Unknown action: ${action}` }))
      return
    }

    const call = {
      auth: { uid: decodedToken.uid, token: decodedToken },
      data,
      rawRequest: req,
    }

    phase = 'runHandler'
    const result = await handlerFn(call)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ result }))
  } catch (err: unknown) {
    console.error(`[groupQuizzes API error at phase: ${phase}]:`, err)
    const errorObj = err as { httpErrorCode?: { status?: number }; message?: string; code?: string; stack?: string }
    const status = errorObj?.httpErrorCode?.status || 500
    const rawCode = errorObj?.code || 'internal'
    const code = rawCode.startsWith('functions/') ? rawCode : `functions/${rawCode}`
    const isDev = process.env.NODE_ENV !== 'production'
    res.statusCode = typeof status === 'number' && status >= 400 && status < 600 ? status : 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: errorObj?.message || 'Something went wrong.',
      code,
      ...(isDev ? { phase, details: String(err) } : {}),
    }))
  }
}
