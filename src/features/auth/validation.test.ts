import { describe, expect, it } from 'vitest'
import { getPasswordStrength, validateSignin, validateSignup } from './validation'

describe('auth form validation', () => {
  it('requires a name, valid email, eight-character password, and matching confirmation', () => {
    expect(validateSignup({ name: ' ', email: 'bad', password: 'short', confirmPassword: 'different' })).toEqual({
      name: 'Enter your name.',
      email: 'Enter a valid email address.',
      password: 'Use at least 8 characters.',
      confirmPassword: 'Passwords do not match.',
    })
  })

  it('accepts valid signup details', () => {
    expect(validateSignup({ name: 'Avery Student', email: 'avery@example.com', password: 'Learn123', confirmPassword: 'Learn123' })).toEqual({})
  })

  it('requires email and password for sign in', () => {
    expect(validateSignin('', '')).toEqual({ email: 'Enter your email address.', password: 'Enter your password.' })
  })

  it('provides a simple password strength hint', () => {
    expect(getPasswordStrength('small')).toBe('weak')
    expect(getPasswordStrength('Learning1')).toBe('fair')
    expect(getPasswordStrength('A-very-Strong123')).toBe('strong')
  })
})
