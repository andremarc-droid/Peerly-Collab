import type { IncomingMessage, ServerResponse } from 'http'
import type { DecodedIdToken } from 'firebase-admin/auth'

export const ALLOWED_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'] as const
export type AllowedModel = (typeof ALLOWED_MODELS)[number]

export const MAX_MESSAGES = 50
export const MAX_TOTAL_CHARACTERS = 1_500_000
export const MAX_TOKENS = 4096

export interface RateWindow {
  startedAtMs: number
  count: number
}

/** Fixed-window rate limiter: returns whether this attempt is allowed, next window to persist, and retry delay. */
export function consumeRateWindow(
  current: RateWindow | null,
  nowMs: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; next: RateWindow; retryAfter: number } {
  if (!current || nowMs < current.startedAtMs || nowMs - current.startedAtMs >= windowMs) {
    return { allowed: true, next: { startedAtMs: nowMs, count: 1 }, retryAfter: 0 }
  }
  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.startedAtMs + windowMs - nowMs) / 1000))
    return { allowed: false, next: current, retryAfter }
  }
  return { allowed: true, next: { startedAtMs: current.startedAtMs, count: current.count + 1 }, retryAfter: 0 }
}

/** Firestore-backed per-user fixed window rate limiter. */
export async function checkUserRateLimit(
  uid: string,
  now = Date.now(),
  limit = 30,
  windowMs = 60_000,
  firestore?: FirebaseFirestore.Firestore,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const { getFirestore } = await import('firebase-admin/firestore')
  const db = firestore ?? getFirestore()
  const ref = db.doc(`aiRateLimits/${uid}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const raw = snap.get('window') as { startedAtMs?: unknown; count?: unknown } | undefined
    const current: RateWindow | null =
      raw && typeof raw.startedAtMs === 'number' && typeof raw.count === 'number'
        ? { startedAtMs: raw.startedAtMs, count: raw.count }
        : null
    const result = consumeRateWindow(current, now, limit, windowMs)
    if (result.allowed) {
      tx.set(ref, { window: result.next }, { merge: true })
    }
    return { allowed: result.allowed, retryAfter: result.retryAfter }
  })
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

    // Rate limit check backed by Firestore
    const rateCheck = await checkUserRateLimit(decoded.uid)
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

    const groqApiKey = process.env.GROQ_API_KEY?.trim()
    if (!groqApiKey) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'AI service is not configured on the server.', code: 'server/not-configured' }))
      return
    }

    // Model allow-list validation
    const requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'qwen/qwen3.8-27b'
    if (!(ALLOWED_MODELS as readonly string[]).includes(requestedModel)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: `Model '${requestedModel}' is not supported. Allowed models: ${ALLOWED_MODELS.join(', ')}`,
        code: 'bad-request',
      }))
      return
    }
    const model = requestedModel as AllowedModel

    // Messages array validation & message count cap
    const messages = body.messages
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: `Request body must include between 1 and ${MAX_MESSAGES} messages.`,
        code: 'bad-request',
      }))
      return
    }

    // Message roles, content types and total character count validation
    const ALLOWED_ROLES = new Set(['system', 'user', 'assistant'])
    let totalChars = 0

    for (const msg of messages) {
      if (typeof msg !== 'object' || msg === null) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Each message must be an object.', code: 'bad-request' }))
        return
      }
      const role = (msg as { role?: unknown }).role
      if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Message role must be 'system', 'user', or 'assistant'.`, code: 'bad-request' }))
        return
      }
      const content = (msg as { content?: unknown }).content
      if (typeof content === 'string') {
        if (!content.trim()) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Message content cannot be empty.', code: 'bad-request' }))
          return
        }
        totalChars += content.length
      } else if (Array.isArray(content)) {
        if (content.length === 0) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Message content parts cannot be empty.', code: 'bad-request' }))
          return
        }
        for (const part of content) {
          if (typeof part !== 'object' || part === null) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Message content part must be an object.', code: 'bad-request' }))
            return
          }
          const partType = (part as { type?: unknown }).type
          if (partType === 'text') {
            const text = (part as { text?: unknown }).text
            if (typeof text !== 'string') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Text content part must contain a text string.', code: 'bad-request' }))
              return
            }
            totalChars += text.length
          } else if (partType === 'image_url') {
            const imageUrl = (part as { image_url?: { url?: unknown } }).image_url
            if (!imageUrl || typeof imageUrl.url !== 'string') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'image_url part must contain a valid URL string.', code: 'bad-request' }))
              return
            }
            totalChars += imageUrl.url.length
          } else {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `Content part type '${String(partType)}' is not supported.`, code: 'bad-request' }))
            return
          }
        }
      } else {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Message content must be a string or array of parts.', code: 'bad-request' }))
        return
      }
    }

    if (totalChars > MAX_TOTAL_CHARACTERS) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        error: `Total message characters (${totalChars}) exceed the limit of ${MAX_TOTAL_CHARACTERS}.`,
        code: 'bad-request',
      }))
      return
    }

    // max_tokens validation
    if (body.max_tokens !== undefined) {
      if (typeof body.max_tokens !== 'number' || !Number.isInteger(body.max_tokens) || body.max_tokens <= 0 || body.max_tokens > MAX_TOKENS) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `max_tokens must be an integer between 1 and ${MAX_TOKENS}.`, code: 'bad-request' }))
        return
      }
    }
    const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 1024
    const temperature = typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : 0.6

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
    console.error('[aiChat error]:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
}
