import { createChatCompletion, GroqError, isAbortError } from '../../lib/groq/client'
import type { GroqMessage } from '../../lib/groq/client'
export { isAbortError }

export type AiFailureReason = 'rate-limit' | 'unavailable' | 'invalid-reply'

export class AiError extends Error {
  readonly reason: AiFailureReason
  constructor(reason: AiFailureReason, message: string) { super(message); this.reason = reason; this.name = 'AiError' }
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

export async function aiComplete(prompt: AiInput, options: AiOptions = {}): Promise<string> {
  try {
    const reply = await (options.complete ?? defaultComplete)(prompt, options.signal, options)
    if (!reply.trim()) throw new AiError('invalid-reply', 'The AI returned an empty response.')
    return reply
  } catch (error) {
    if (isAbortError(error)) throw error
    if (error instanceof AiError) throw error
    if (error instanceof GroqError && error.status === 429) throw new AiError('rate-limit', error.message)
    throw new AiError('unavailable', error instanceof Error ? error.message : 'The AI is unavailable right now.')
  }
}

export function extractJson(reply: string): unknown {
  const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
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
      const parsed = parse(extractJson(reply))
      if (parsed !== null) return parsed
      lastError = new SyntaxError('The JSON did not match the expected shape.')
    } catch (error) {
      if (isAbortError(error)) throw error
      if (error instanceof AiError && error.reason === 'rate-limit') throw error
      lastError = error
      if (error instanceof AiError && error.reason === 'unavailable') throw error
    }
  }
  throw new AiError('invalid-reply', lastError instanceof Error ? lastError.message : 'The AI reply was not valid JSON.')
}

export function describeAiFailure(error: unknown): string {
  if (error instanceof AiError) {
    if (error.reason === 'rate-limit') return 'The AI is busy right now. Try again shortly or continue without AI.'
    if (error.reason === 'invalid-reply') return 'The AI response could not be used. Try again or continue without AI.'
  }
  return 'The AI is unavailable right now. You can continue without AI.'
}
