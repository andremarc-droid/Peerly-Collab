import type { IncomingMessage, ServerResponse } from 'http'

import type { DecodedIdToken } from 'firebase-admin/auth'

import {
  authFailureReason,
  ensureFirebase,
  getServerProjectId,
  verifyAuthToken,
} from './tokenVerification.js'

/**
 * Vercel endpoint for the scoreboard, study group and public deck server actions. It runs the same handlers as
 * `functions/src` so the app works without deploying Cloud Functions (the same approach as `api/groupQuizzes.ts`).
 * Only the actions listed here can be called. Literal import paths keep the bundler able to trace the handler files.
 */
type Handler = (call: unknown) => Promise<unknown>

const LOADERS: Record<string, () => Promise<Handler>> = {
  updateScoreboardOptIn: async () => (await import('../functions/src/scoreboard.js')).updateScoreboardOptInHandler as unknown as Handler,
  ensureScoreboardEntry: async () => (await import('../functions/src/scoreboard.js')).ensureScoreboardEntryHandler as unknown as Handler,
  joinStudyGroup: async () => (await import('../functions/src/studyGroups.js')).joinStudyGroupHandler as unknown as Handler,
  leaveStudyGroup: async () => (await import('../functions/src/studyGroups.js')).leaveStudyGroupHandler as unknown as Handler,
  removeStudyGroupMember: async () => (await import('../functions/src/studyGroups.js')).removeStudyGroupMemberHandler as unknown as Handler,
  savePublicDeck: async () => (await import('../functions/src/publicDecks.js')).savePublicDeckHandler as unknown as Handler,
}

export const APP_CALLABLE_ACTIONS = Object.keys(LOADERS)

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

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  let phase = 'start'
  let action = ''
  try {
    let body = req.body as Record<string, unknown> | string | undefined
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as Record<string, unknown>
      } catch {
        body = undefined
      }
    }
    if (!body || typeof body !== 'object') body = await parseBody(req)
    action = typeof body?.action === 'string' ? body.action : ''
    const data = body?.data

    // Reject anything that is not an allowed action before doing any work.
    const load = Object.prototype.hasOwnProperty.call(LOADERS, action) ? LOADERS[action] : undefined
    if (!load) {
      sendJson(res, 400, { error: `Unknown action: ${action}` })
      return
    }

    const isDev = process.env.NODE_ENV !== 'production'
    const authHeader = req.headers.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      sendJson(res, 401, {
        error: 'Missing Authorization header. Please sign in.',
        code: 'functions/unauthenticated',
        reason: 'missing-authorization-header',
        serverProject: getServerProjectId(),
      })
      return
    }
    const token = authHeader.substring(7).trim()
    if (!token) {
      sendJson(res, 401, {
        error: 'Empty Bearer token provided.',
        code: 'functions/unauthenticated',
        reason: 'empty-bearer-token',
        serverProject: getServerProjectId(),
      })
      return
    }

    phase = 'initFirebase'
    await ensureFirebase()

    phase = 'verifyAuth'
    let decodedToken: DecodedIdToken
    try {
      decodedToken = await verifyAuthToken(token, { anonymousErrorMsg: 'Anonymous accounts are not permitted.' })
    } catch (err: unknown) {
      const isAnon = (err as { code?: string }).code === 'auth/anonymous-not-allowed'
      sendJson(res, isAnon ? 403 : 401, {
        error: isAnon ? 'Anonymous accounts are not permitted.' : 'Authentication failed. Please sign in again.',
        code: isAnon ? 'functions/permission-denied' : 'functions/unauthenticated',
        reason: isAnon ? 'anonymous' : authFailureReason(err),
        serverProject: getServerProjectId(),
        ...(isDev ? { details: err instanceof Error ? err.message : String(err) } : {}),
      })
      return
    }

    phase = 'importHandler'
    const handlerFn = await load()

    phase = 'runHandler'
    const result = await handlerFn({ auth: { uid: decodedToken.uid, token: decodedToken }, data, rawRequest: req })
    sendJson(res, 200, { result })
  } catch (err: unknown) {
    console.error(`[appCallables API error at phase: ${phase} action: ${action || 'unknown'}]:`, err)
    const errorObj = err as {
      httpErrorCode?: { status?: number; canonicalName?: string }
      message?: string
      code?: string
      stack?: string
    }
    const status = errorObj?.httpErrorCode?.status
    const rawCode = errorObj?.code || 'internal'
    const code = rawCode.startsWith('functions/') ? rawCode : `functions/${rawCode}`
    const isDev = process.env.NODE_ENV !== 'production'
    const isInit = phase === 'initFirebase' || phase === 'importHandler'

    const statusCode = typeof status === 'number' && status >= 400 && status < 600
      ? status
      : 500

    const message = (!isDev && (statusCode >= 500 || isInit))
      ? (isInit ? 'Failed to initialize the server service.' : 'Something went wrong.')
      : (errorObj?.message || 'Something went wrong.')

    sendJson(res, statusCode, {
      error: message,
      code,
      ...(isDev ? { phase, action: action || undefined, details: String(err) } : {}),
    })
  }
}
