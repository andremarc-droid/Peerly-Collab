import type { IncomingMessage, ServerResponse } from 'http'
import type { DecodedIdToken } from 'firebase-admin/auth'

// In-memory rate limiter per user: max 30 requests per 60 seconds
const userRateLimits = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 30

export function checkUserRateLimit(uid: string, now = Date.now()): { allowed: boolean; retryAfter: number } {
  let timestamps = userRateLimits.get(uid)
  if (!timestamps) {
    timestamps = []
    userRateLimits.set(uid, timestamps)
  }
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  timestamps = timestamps.filter((t) => t > cutoff)
  userRateLimits.set(uid, timestamps)

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = timestamps[0]
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000))
    return { allowed: false, retryAfter }
  }

  timestamps.push(now)
  return { allowed: true, retryAfter: 0 }
}

let firebaseInitialized = false

async function ensureFirebase() {
  if (firebaseInitialized) return
  const { getApps, initializeApp, cert } = await import('firebase-admin/app')
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing on server.')
    }
    let clean = raw
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim()
    }
    try {
      const jsonStr = clean.startsWith('{') ? clean : Buffer.from(clean, 'base64').toString('utf-8')
      const credentials = JSON.parse(jsonStr) as Record<string, unknown>
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

async function verifyAuthToken(token: string): Promise<DecodedIdToken> {
  const { getAuth } = await import('firebase-admin/auth')
  const decodedToken = await getAuth().verifyIdToken(token, true)
  if (decodedToken.firebase?.sign_in_provider === 'anonymous') {
    const err = new Error('Anonymous accounts are not permitted for AI services.')
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
  res: ServerResponse,
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

  try {
    await ensureFirebase()

    const authHeader = req.headers.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing Authorization header. Please sign in.', code: 'auth/unauthenticated' }))
      return
    }

    const token = authHeader.substring(7).trim()
    if (!token) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Empty Bearer token provided.', code: 'auth/unauthenticated' }))
      return
    }

    let decoded: DecodedIdToken
    try {
      decoded = await verifyAuthToken(token)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('AI auth error:', msg)
      const isAnon = (err as unknown as { code?: string }).code === 'auth/anonymous-not-allowed'
      res.statusCode = isAnon ? 403 : 401
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: isAnon ? 'Anonymous accounts are not permitted for AI services.' : 'Authentication failed. Please sign in again.',
        code: isAnon ? 'auth/permission-denied' : 'auth/unauthenticated',
      }))
      return
    }

    // Rate limit check
    const rateCheck = checkUserRateLimit(decoded.uid)
    if (!rateCheck.allowed) {
      res.statusCode = 429
      res.setHeader('Retry-After', String(rateCheck.retryAfter))
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: `AI request limit exceeded. Try again in ${rateCheck.retryAfter} seconds.`,
        code: 'rate-limited',
        retryAfter: rateCheck.retryAfter,
      }))
      return
    }

    // Parse request body
    let body = req.body as Record<string, unknown> | string | undefined
    if (typeof body === 'string') {
      try { body = JSON.parse(body) as Record<string, unknown> } catch { body = undefined }
    }
    if (!body || typeof body !== 'object') {
      body = await parseBody(req)
    }

    const groqApiKey = process.env.GROQ_API_KEY?.trim() || process.env.VITE_GROQ_API_KEY?.trim()
    if (!groqApiKey) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'AI service is not configured on the server.', code: 'server/not-configured' }))
      return
    }

    const messages = body.messages
    if (!Array.isArray(messages) || messages.length === 0) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Request body must include a non-empty messages array.', code: 'bad-request' }))
      return
    }

    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'qwen/qwen3.8-27b'
    const maxTokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, 4096) : 1024
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.6

    const groqPayload: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }
    if (model.startsWith('qwen/')) groqPayload.reasoning_effort = 'none'
    else if (model.startsWith('openai/gpt-oss')) groqPayload.reasoning_effort = 'low'

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(groqPayload),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => '')
      let groqErr: { error?: { message?: string } } = {}
      try { groqErr = JSON.parse(errText) } catch {}
      const retryHeader = groqRes.headers.get('retry-after')
      res.statusCode = groqRes.status
      if (retryHeader) res.setHeader('Retry-After', retryHeader)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: groqErr.error?.message || `AI service error (${groqRes.status})`,
        status: groqRes.status,
      }))
      return
    }

    const data = await groqRes.json() as { choices?: Array<{ message?: { content?: string } }> }
    const rawContent = data.choices?.[0]?.message?.content ?? ''
    // Strip thinking if any
    const content = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ text: content, choices: [{ message: { content } }] }))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[aiChat error]:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error', details: msg }))
  }
}
