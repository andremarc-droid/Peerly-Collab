import { describe, expect, it } from 'vitest'
import { DEFAULT_GROQ_MODEL, getGroqConfig, getGroqConfigIssue, validateGroqEnv } from './requiredEnv'

describe('validateGroqEnv', () => {
  it('falls back to the default vision model when env is empty', () => {
    expect(validateGroqEnv({})).toEqual({ model: DEFAULT_GROQ_MODEL })
  })

  it('uses VITE_GROQ_MODEL when provided', () => {
    expect(validateGroqEnv({ VITE_GROQ_MODEL: ' other/model ' }).model).toBe('other/model')
  })
})

describe('getGroqConfig', () => {
  it('returns default model when no env provided', () => {
    expect(getGroqConfig({})).toEqual({ model: DEFAULT_GROQ_MODEL })
  })
})

describe('getGroqConfigIssue', () => {
  it('returns null since Groq is proxied through the server', () => {
    expect(getGroqConfigIssue({})).toBeNull()
  })
})
