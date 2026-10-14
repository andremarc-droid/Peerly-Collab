export const GROQ_MODEL_VAR = 'VITE_GROQ_MODEL'
/** Vision-capable model on Groq. Override with VITE_GROQ_MODEL. */
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b'

export const GROQ_LESSON_MODEL_VAR = 'VITE_GROQ_LESSON_MODEL'
/** Text-only model that writes lessons (it cannot read images). Override with VITE_GROQ_LESSON_MODEL. */
export const DEFAULT_GROQ_LESSON_MODEL = 'openai/gpt-oss-20b'

export interface GroqConfig {
  model: string
}

export type EnvSource = Record<string, string | undefined>

/** Reads the Groq model settings. Model is optional and falls back to default. */
export function validateGroqEnv(env: EnvSource = import.meta.env): GroqConfig {
  return { model: env[GROQ_MODEL_VAR]?.trim() || DEFAULT_GROQ_MODEL }
}

/** Evaluated lazily. */
export function getGroqConfig(env: EnvSource = import.meta.env): GroqConfig {
  return { model: env[GROQ_MODEL_VAR]?.trim() || DEFAULT_GROQ_MODEL }
}

/** The model used to write lessons. Everything else uses VITE_GROQ_MODEL. */
export function getGroqLessonModel(env: EnvSource = import.meta.env): string {
  return env[GROQ_LESSON_MODEL_VAR]?.trim() || DEFAULT_GROQ_LESSON_MODEL
}

export const GROQ_VISION_MODEL_VAR = 'VITE_GROQ_VISION_MODEL'

/** False for models known to be text-only. Any other model is assumed to read images. */
export function modelReadsImages(model: string): boolean {
  return !model.startsWith('openai/gpt-oss')
}

/** The model used for requests that contain images when the main model cannot read them. */
export function getGroqVisionModel(env: EnvSource = import.meta.env): string {
  return env[GROQ_VISION_MODEL_VAR]?.trim() || DEFAULT_GROQ_MODEL
}

/** A plain-language problem description, or null when Groq is configured. */
export function getGroqConfigIssue(_env: EnvSource = import.meta.env): string | null {
  return null
}
