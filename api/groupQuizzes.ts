import type { IncomingMessage, ServerResponse } from 'http'

import type { DecodedIdToken } from 'firebase-admin/auth'

import {
  authFailureReason,
  ensureFirebase,
  getServerProjectId,
  resetFirebaseInitializedForTest,
  verifyAuthToken,
} from './tokenVerification.js'

// Lazy loaded singletons
let handlersCache: Record<string, unknown> | null = null

export function _resetFirebaseInitializedForTest() {
  resetFirebaseInitializedForTest()
  handlersCache = null
}

async function getHandlers() {
  if (!handlersCache) {
    handlersCache = (await import('../functions/src/groupQuizzes.js')) as unknown as Record<string, unknown>
  }
  return handlersCache
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
        reason: 'missing-authorization-header',
        serverProject: getServerProjectId(),
        serverNode: process.version,
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
        reason: 'empty-bearer-token',
        serverProject: getServerProjectId(),
        serverNode: process.version,
        ...(isDev ? { phase: 'verifyAuth', details: 'Bearer token string was empty.' } : {}),
      }))
      return
    }

    let decodedToken: DecodedIdToken
    try {
      decodedToken = await verifyAuthToken(token, {
        anonymousErrorMsg: 'Anonymous accounts are not permitted for group quizzes.',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('Invalid, revoked, or anonymous ID token provided:', msg)
      const isAnon = (err as unknown as { code?: string }).code === 'auth/anonymous-not-allowed'
      res.statusCode = isAnon ? 403 : 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: isAnon ? 'Anonymous accounts are not permitted for group quizzes.' : 'Authentication failed. Please sign in again.',
        code: isAnon ? 'functions/permission-denied' : 'functions/unauthenticated',
        reason: isAnon ? 'anonymous' : authFailureReason(err),
        serverProject: getServerProjectId(),
        serverNode: process.version,
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
    const isInitOrImport = phase === 'initFirebase' || phase === 'importHandlers'
    const message = (!isDev && isInitOrImport)
      ? 'Failed to initialize the server service.'
      : (errorObj?.message || 'Something went wrong.')
    res.statusCode = typeof status === 'number' && status >= 400 && status < 600 ? status : 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: message,
      code,
      ...(isDev ? { phase, details: String(err) } : {}),
    }))
  }
}
