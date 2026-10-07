import { describe, expect, it } from 'vitest'
import { DEFAULT_GROQ_MODEL, getGroqConfigIssue, validateGroqEnv } from './requiredEnv'

describe('validateGroqEnv', () => {
  it('requires the API key and names the variable in the error', () => {
    expect(() => validateGroqEnv({})).toThrow('VITE_GROQ_API_KEY')
    expect(() => validateGroqEnv({ VITE_GROQ_API_KEY: '   ' })).toThrow('VITE_GROQ_API_KEY')
  })

  it('trims the key and falls back to the default vision model', () => {
    expect(validateGroqEnv({ VITE_GROQ_API_KEY: ' key ' })).toEqual({ apiKey: 'key', model: DEFAULT_GROQ_MODEL })
  })

  it('uses VITE_GROQ_MODEL when provided', () => {
    expect(validateGroqEnv({ VITE_GROQ_API_KEY: 'key', VITE_GROQ_MODEL: ' other/model ' }).model).toBe('other/model')
  })
})

describe('getGroqConfigIssue', () => {
  it('returns null when configured and a message when not', () => {
    expect(getGroqConfigIssue({ VITE_GROQ_API_KEY: 'key' })).toBeNull()
    expect(getGroqConfigIssue({})).toContain('VITE_GROQ_API_KEY')
  })
})
