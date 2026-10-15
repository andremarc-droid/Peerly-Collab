import { Capacitor } from '@capacitor/core'
import { getGroqConfig, getGroqVisionModel, modelReadsImages, type GroqConfig } from './requiredEnv'

export const DEFAULT_MAX_TOKENS = 1024

export function getAiChatEndpoint(): string {
  const custom = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (custom) return `${custom}/api/aiChat`
  if (Capacitor.isNativePlatform() || (typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || (window.location.hostname === 'localhost' && window.location.port === '')))) {
    return 'https://peerly-collab.vercel.app/api/aiChat'
  }
  return '/api/aiChat'
}

export type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | GroqContentPart[]
}

export type GroqFetch = (input: string, init: RequestInit) => Promise<Response>

export interface ChatCompletionOptions {
  messages: GroqMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  config?: GroqConfig
  fetchImpl?: GroqFetch
}

export type CompleteFn = (options: ChatCompletionOptions) => Promise<string>

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>
}

export class GroqError extends Error {
  readonly status: number | null
  readonly retryAfterSeconds: number | null

  constructor(message: string, status: number | null = null, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'GroqError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
}

/** Removes any <think>…</think> reasoning so only the final answer is shown. */
export function stripThinking(text: string): string {
  const withoutBlocks = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const open = withoutBlocks.indexOf('<think>')
  return (open === -1 ? withoutBlocks : withoutBlocks.slice(0, open)).trim()
}

/** Groq's 429 text ends with e.g. "Please try again in 14m22.5s"; returns that wait in whole seconds. */
function parseWaitFromMessage(message: string): number | null {
  const match = /try again in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i.exec(message)
  if (!match) return null
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  return seconds > 0 ? Math.ceil(seconds) : null
}

/** Reads the visible claims of a Firebase ID token for debugging. The token itself and its signature are never logged. */
function describeToken(token: string | null): { present: boolean; projectAud?: string; issuer?: string; signInProvider?: string; expiresAt?: string; expired?: boolean; unreadable?: true } {
  if (!token) return { present: false }
  try {
    const part = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))) as { aud?: unknown; iss?: unknown; exp?: unknown; firebase?: { sign_in_provider?: unknown } }
    const expMs = typeof claims.exp === 'number' ? claims.exp * 1000 : null
    return {
      present: true,
      projectAud: typeof claims.aud === 'string' ? claims.aud : undefined,
      issuer: typeof claims.iss === 'string' ? claims.iss : undefined,
      signInProvider: typeof claims.firebase?.sign_in_provider === 'string' ? claims.firebase.sign_in_provider : undefined,
      expiresAt: expMs ? new Date(expMs).toISOString() : undefined,
      expired: expMs ? expMs < Date.now() : undefined,
    }
  } catch {
    return { present: true, unreadable: true }
  }
}

/**
 * Prints one console group whenever the AI proxy rejects a request, with everything needed to see why:
 * where the request went, which Firebase project the sign-in token belongs to, what the server answered, and a diagnosis.
 */
async function logAiChatFailure(input: string, init: RequestInit, response: Response): Promise<void> {
  try {
    const header = new Headers(init.headers as HeadersInit).get('Authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    const tokenInfo = describeToken(token)
    const raw = await response.clone().text()
    let body: unknown = raw.slice(0, 500)
    try { body = JSON.parse(raw) } catch { /* Not JSON: probably not our handler. */ }
    const json = typeof body === 'object' && body !== null ? (body as { reason?: unknown; serverProject?: unknown; code?: unknown }) : null
    const reason = typeof json?.reason === 'string' ? json.reason : null
    const serverProject = typeof json?.serverProject === 'string' ? json.serverProject : null
    const clientProject = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? '(VITE_FIREBASE_PROJECT_ID not set)'

    let diagnosis: string
    if (json?.code === 'server/not-configured') diagnosis = 'The server has no GROQ_API_KEY. In Vercel open Settings > Environment Variables, add GROQ_API_KEY (exactly that name, no VITE_ prefix) for Production, then redeploy.'
    else if (response.status !== 401 && response.status !== 403) diagnosis = `The AI proxy answered ${response.status}. See the server response below.`
    else if (!tokenInfo.present) diagnosis = 'No sign-in token was sent. This tab thinks you are signed out: sign out and sign in again.'
    else if (tokenInfo.expired) diagnosis = 'The token is already expired. Reload the page or sign in again.'
    else if (!json) diagnosis = 'The 401 did not come from the aiChat handler (its body is not the handler JSON). Check the endpoint URL below and Vercel Deployment Protection.'
    else if (tokenInfo.projectAud && serverProject && tokenInfo.projectAud !== serverProject) diagnosis = `PROJECT MISMATCH: your token is for "${tokenInfo.projectAud}" but the server's service account is for "${serverProject}". Put a service account key from "${tokenInfo.projectAud}" into FIREBASE_SERVICE_ACCOUNT on Vercel and redeploy.`
    else if (reason === 'wrong-firebase-project') diagnosis = `The server's service account belongs to another Firebase project than "${tokenInfo.projectAud ?? clientProject}". Replace FIREBASE_SERVICE_ACCOUNT on Vercel and redeploy.`
    else if (reason === 'service-account-permission') diagnosis = 'The server service account may not check sign-ins: enable the Identity Toolkit API and give it a Firebase Authentication role.'
    else if (reason) diagnosis = `The server rejected the token (reason: ${reason}).`
    else diagnosis = 'The server gave no reason, so the deployed server is probably older than this code. Redeploy the latest commit and try again.'

    console.group(`[aiChat debug] HTTP ${response.status} from the AI proxy`)
    console.log('DIAGNOSIS:', diagnosis)
    console.log('endpoint:', input, '| page origin:', typeof window !== 'undefined' ? window.location.origin : '(none)')
    console.log('client Firebase project:', clientProject)
    console.log('sign-in token:', tokenInfo)
    console.log('server response:', body)
    console.groupEnd()
  } catch {
    // Debug output must never break the request itself.
  }
}

async function toGroqError(response: Response): Promise<GroqError> {
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { message?: string } | string }
    detail =
      typeof body.error === 'object' && body.error?.message
        ? body.error.message
        : typeof body.error === 'string'
        ? body.error
        : ''
  } catch {
    // The error body was not JSON; the status code is enough.
  }

  const retryHeader = Number(response.headers.get('retry-after'))
  const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? Math.ceil(retryHeader) : (response.status === 429 ? parseWaitFromMessage(detail) : null)
  if (response.status === 429) console.warn('[groq] rate limited:', detail || '(no detail)', { retryAfterHeader: response.headers.get('retry-after') })

  switch (response.status) {
    case 401:
      return new GroqError(
        detail && !detail.toLowerCase().includes('key')
          ? detail
          : 'Authentication failed for the AI service. Please sign in again.',
        response.status,
      )
    case 403:
      return new GroqError(
        detail || 'You do not have permission to access the AI service.',
        response.status,
      )
    case 413:
      return new GroqError('This message is too large for the AI service. Try a shorter message or fewer images.', response.status)
    case 429:
      return new GroqError(
        retryAfter
          ? `The AI is busy right now (rate limit). Try again in ${retryAfter} seconds.`
          : 'The AI is busy right now (rate limit). Try again in a minute.',
        response.status,
        retryAfter,
      )
    case 400:
      return new GroqError(
        detail ? `The AI could not process this message: ${detail}` : 'The AI could not process this message.',
        response.status,
      )
    default:
      return new GroqError(
        detail ||
          (response.status >= 500
            ? 'The AI service is having trouble. Try again shortly.'
            : `The AI request failed (${response.status}).`),
        response.status,
      )
  }
}

/**
 * Sends one chat completion request to the AI proxy (/api/aiChat) and returns the reply text.
 * Qwen models run in fast instruct mode (reasoning_effort "none") to save tokens against the rate limit.
 */
export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const configured = options.config ?? getGroqConfig()
  const hasImages = options.messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'))
  // A text-only model (such as gpt-oss) cannot read images, so requests that contain images use the vision model.
  const config = hasImages && !modelReadsImages(configured.model) ? { ...configured, model: getGroqVisionModel() } : configured
  const send: GroqFetch = options.fetchImpl ?? (async (input, init) => {
    let response: Response
    try {
      response = await fetch(input, init)
    } catch (error) {
      if (!isAbortError(error)) console.error('[aiChat debug] The request never reached the AI proxy:', input, error)
      throw error
    }
    if (!response.ok) await logAiChatFailure(input, init, response)
    return response
  })

  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: options.temperature ?? 0.6,
    stream: false,
  }
  if (config.model.startsWith('qwen/')) body.reasoning_effort = 'none'

  let response: Response
  try {
    let token: string | undefined
    try {
      const { auth } = await import('../firebase/auth')
      if (typeof auth?.authStateReady === 'function') {
        await auth.authStateReady()
      }
      token = await auth?.currentUser?.getIdToken()
    } catch {
      // Firebase client not loaded
    }
    response = await send(getAiChatEndpoint(), {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })

    // If rejected with 401 (e.g. expired token), force-refresh the ID token and retry once
    if (!response.ok && response.status === 401) {
      try {
        const { auth } = await import('../firebase/auth')
        if (auth?.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true)
          if (freshToken && freshToken !== token) {
            response = await send(getAiChatEndpoint(), {
              method: 'POST',
              signal: options.signal,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              body: JSON.stringify(body),
            })
          }
        }
      } catch {
        // Fall through to error handler
      }
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new GroqError('Could not reach the AI service. Check your connection and try again.')
  }

  if (!response.ok) throw await toGroqError(response)

  const data = (await response.json()) as ChatCompletionResponse & { text?: string }
  const text = stripThinking(data.text ?? data.choices?.[0]?.message?.content ?? '')
  if (!text) throw new GroqError('The AI returned an empty reply. Please try again.', response.status)
  return text
}
