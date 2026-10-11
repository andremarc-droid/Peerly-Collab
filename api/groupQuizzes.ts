import type { IncomingMessage, ServerResponse } from 'http'
import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import * as handlers from '../functions/lib/groupQuizzes.js'

function initFirebase() {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    if (raw) {
      try {
        const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
        const credentials = JSON.parse(jsonStr)
        initializeApp({ credential: cert(credentials) })
      } catch (err) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT, falling back to default credentials:', err)
        initializeApp()
      }
    } else {
      initializeApp()
    }
  }
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
  })
}

export default async function handler(
  req: IncomingMessage & { body?: Record<string, unknown> },
  res: ServerResponse & { status?: (code: number) => unknown; json?: (data: unknown) => unknown }
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

  initFirebase()

  const body = req.body || await parseBody(req)
  const action = typeof body.action === 'string' ? body.action : ''
  const data = body.data

  const authHeader = req.headers.authorization
  let uid: string | undefined
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const decoded = await getAuth().verifyIdToken(token)
      uid = decoded.uid
    } catch (err) {
      console.warn('Invalid ID token provided:', err)
    }
  }

  const handlerFn = (handlers as Record<string, unknown>)[action] as ((call: unknown) => Promise<unknown>) | undefined
  if (typeof handlerFn !== 'function') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `Unknown action: ${action}` }))
    return
  }

  const call = {
    auth: uid ? { uid, token: {} } : undefined,
    data,
    rawRequest: req,
  }

  try {
    const result = await handlerFn(call)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ result }))
  } catch (err: unknown) {
    const errorObj = err as { httpErrorCode?: { status?: number }; message?: string; code?: string }
    const status = errorObj?.httpErrorCode?.status || 500
    const rawCode = errorObj?.code || 'internal'
    const code = rawCode.startsWith('functions/') ? rawCode : `functions/${rawCode}`
    res.statusCode = typeof status === 'number' && status >= 400 && status < 600 ? status : 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({
      error: errorObj?.message || 'Something went wrong.',
      code,
    }))
  }
}
