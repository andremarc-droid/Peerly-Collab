import { createChatCompletion, GroqError, isAbortError } from '../../lib/groq/client'
import type { GroqMessage } from '../../lib/groq/client'
export { isAbortError }

export type AiFailureReason = 'rate-limit' | 'unavailable' | 'invalid-reply'

export class AiError extends Error {
  readonly reason: AiFailureReason
  /** Seconds Groq asked us to wait before retrying, when it said so. */
  readonly retryAfterSeconds: number | null
  constructor(reason: AiFailureReason, message: string, retryAfterSeconds: number | null = null) { super(message); this.reason = reason; this.retryAfterSeconds = retryAfterSeconds; this.name = 'AiError' }
}

export type AiInput = string | GroqMessage[]
export interface AiGenerationSettings { maxTokens?: number; temperature?: number }
export type AiComplete = (prompt: AiInput, signal?: AbortSignal, settings?: AiGenerationSettings) => Promise<string>
export interface AiOptions extends AiGenerationSettings { complete?: AiComplete; signal?: AbortSignal }
const defaultComplete: AiComplete = async (prompt, signal, settings) => createChatCompletion({
  messages: typeof prompt === 'string' ? [{ role: 'user', content: prompt }] : prompt,
  signal,
  maxTokens: settings?.maxTokens ?? 1600,
  temperature: settings?.temperature ?? 0.3,
})

const UNREADABLE_REPLY = 'The AI reply could not be read. Try again.'
/** Replies nested deeper than this are never valid lesson, quiz, or card JSON, and can overflow the parser's stack. */
const MAX_JSON_DEPTH = 64

/** True when brackets nest deeper than `limit`. Text inside strings is skipped, so brackets in sentences do not count. */
export function exceedsJsonDepth(text: string, limit = MAX_JSON_DEPTH): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
    } else if (character === '"') inString = true
    else if (character === '{' || character === '[') {
      depth += 1
      if (depth > limit) return true
    } else if (character === '}' || character === ']') depth = Math.max(0, depth - 1)
  }
  return false
}

/** A RangeError (for example "Maximum call stack size exceeded") means a bug or hostile input, not something to show raw. */
function describeUnexpected(error: unknown, fallback: string): string {
  if (error instanceof RangeError) {
    console.error('[ai] RangeError while handling an AI request', error)
    return UNREADABLE_REPLY
  }
  return error instanceof Error ? error.message : fallback
}

export async function aiComplete(prompt: AiInput, options: AiOptions = {}): Promise<string> {
  try {
    // Pass only the generation settings. Passing the whole options object would hand `complete` back to
    // callers that spread the settings into a nested aiComplete call, which then recurses forever.
    const settings: AiGenerationSettings = { maxTokens: options.maxTokens, temperature: options.temperature }
    const reply = await (options.complete ?? defaultComplete)(prompt, options.signal, settings)
    if (!reply.trim()) throw new AiError('invalid-reply', 'The AI returned an empty response.')
    return reply
  } catch (error) {
    if (isAbortError(error)) throw error
    if (error instanceof AiError) throw error
    if (error instanceof GroqError && error.status === 429) throw new AiError('rate-limit', error.message, error.retryAfterSeconds)
    throw new AiError('unavailable', describeUnexpected(error, 'The AI is unavailable right now.'))
  }
}

export function extractJson(reply: string): unknown {
  const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  if (exceedsJsonDepth(clean)) throw new SyntaxError('The AI reply was nested too deeply to read.')
  try { return JSON.parse(clean) as unknown } catch { /* Find a JSON object in surrounding explanation. */ }
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) throw new SyntaxError('No JSON object was found in the AI reply.')
  return JSON.parse(clean.slice(start, end + 1)) as unknown
}

export async function aiJson<T>(
  prompt: string,
  parse: (value: unknown) => T | null,
  options: AiOptions = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryHint = attempt === 0 ? '' : '\nYour previous reply was unusable. Return only valid JSON matching the requested shape.'
    try {
      const reply = await aiComplete(`${prompt}${retryHint}`, options)
      let value: unknown
      try { value = extractJson(reply) } catch (error) {
        console.warn('[ai] reply was not valid JSON:', error instanceof Error ? error.message : error, '\nStart:', reply.slice(0, 200), '\nEnd:', reply.slice(-200))
        throw error
      }
      const parsed = parse(value)
      if (parsed !== null) return parsed
      lastError = new SyntaxError('The JSON did not match the expected shape.')
    } catch (error) {
      if (isAbortError(error)) throw error
      if (error instanceof AiError && error.reason === 'rate-limit') throw error
      lastError = error
      if (error instanceof AiError && error.reason === 'unavailable') throw error
    }
  }
  throw new AiError('invalid-reply', describeUnexpected(lastError, 'The AI reply was not valid JSON.'))
}

export function describeAiFailure(error: unknown): string {
  if (error instanceof AiError) {
    if (error.reason === 'rate-limit') return 'The AI is busy right now. Try again shortly or continue without AI.'
    if (error.reason === 'invalid-reply') return 'The AI response could not be used. Try again or continue without AI.'
  }
  return 'The AI is unavailable right now. You can continue without AI.'
}
