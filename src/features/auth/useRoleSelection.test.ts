import { describe, expect, it } from 'vitest'
import { roleChoices } from '../landing/roleChoices'
import { resolveRoleMode } from './useRoleSelection'

describe('resolveRoleMode', () => {
  it('uses the mode from the address when it is valid', () => {
    expect(resolveRoleMode('signup', 'signin')).toBe('signup')
    expect(resolveRoleMode('signin', 'signup')).toBe('signin')
    expect(resolveRoleMode('continue', undefined)).toBe('continue')
  })

  it('falls back to the saved intent, then to sign in', () => {
    expect(resolveRoleMode(null, 'signup')).toBe('signup')
    expect(resolveRoleMode('nonsense', 'continue')).toBe('continue')
    expect(resolveRoleMode(null, undefined)).toBe('signin')
  })
})

describe('roleChoices', () => {
  it('lists student first and instructor second, the order arrow keys move through', () => {
    expect(roleChoices.map((choice) => choice.role)).toEqual(['student', 'instructor'])
  })
})
