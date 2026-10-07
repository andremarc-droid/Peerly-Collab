import { getGroqConfig, type GroqConfig } from './requiredEnv'

export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const DEFAULT_MAX_TOKENS = 1024

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

async function toGroqError(response: Response): Promise<GroqError> {
  let detail = ''
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    detail = body.error?.message ?? ''
  } catch {
    // The error body was not JSON; the status code is enough.
  }

  const retryHeader = Number(response.headers.get('retry-after'))
  const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? Math.ceil(retryHeader) : null

  switch (response.status) {
    case 401:
    case 403:
      return new GroqError('The AI service rejected the API key. Check VITE_GROQ_API_KEY.', response.status)
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
        response.status >= 500
          ? 'The AI service is having trouble. Try again shortly.'
          : `The AI request failed (${response.status}).`,
        response.status,
      )
  }
}

/**
 * Sends one chat completion request to Groq and returns the reply text.
 * Qwen models run in fast instruct mode (reasoning_effort "none") to save tokens against the rate limit.
 */
export async function createChatCompletion(options: ChatCompletionOptions): Promise<string> {
  const config = options.config ?? getGroqConfig()
  const send: GroqFetch = options.fetchImpl ?? ((input, init) => fetch(input, init))

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
    response = await send(GROQ_CHAT_URL, {
      method: 'POST',
      signal: options.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new GroqError('Could not reach the AI service. Check your connection and try again.')
  }

  if (!response.ok) throw await toGroqError(response)

  const data = (await response.json()) as ChatCompletionResponse
  const text = stripThinking(data.choices?.[0]?.message?.content ?? '')
  if (!text) throw new GroqError('The AI returned an empty reply. Please try again.', response.status)
  return text
}
