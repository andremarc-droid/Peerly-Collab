export const GROQ_API_KEY_VAR = 'VITE_GROQ_API_KEY'
export const GROQ_MODEL_VAR = 'VITE_GROQ_MODEL'
/** Vision-capable model on Groq. Override with VITE_GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b'

export interface GroqConfig {
  apiKey: string
  model: string
}

export type EnvSource = Record<string, string | undefined>

/** Reads the Groq settings. The API key is required; the model is optional. */
export function validateGroqEnv(env: EnvSource): GroqConfig {
  const apiKey = env[GROQ_API_KEY_VAR]?.trim()
  if (!apiKey) {
    throw new Error(
      `Missing required environment variable ${GROQ_API_KEY_VAR}. Add it to .env.local and restart the dev server.`,
    )
  }
  return { apiKey, model: env[GROQ_MODEL_VAR]?.trim() || DEFAULT_GROQ_MODEL }
}

/** Evaluated lazily so a missing key disables the AI tutor instead of crashing the whole app. */
export function getGroqConfig(env: EnvSource = import.meta.env): GroqConfig {
  return validateGroqEnv(env)
}

/** A plain-language problem description, or null when Groq is configured. */
export function getGroqConfigIssue(env: EnvSource = import.meta.env): string | null {
  try {
    getGroqConfig(env)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'The AI tutor is not configured.'
  }
}
