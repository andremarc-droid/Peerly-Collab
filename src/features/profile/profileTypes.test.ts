import { describe, expect, it } from 'vitest'
import { getRoleMismatch, resolveProfileRole } from './profileTypes'

describe('profile role safeguards', () => {
  it('keeps an existing role when a different role is chosen', () => {
    expect(resolveProfileRole('instructor', 'student')).toBe('instructor')
  })

  it('fills a missing role from the selected role without replacing a role later', () => {
    const firstChoice = resolveProfileRole(null, 'student')
    expect(firstChoice).toBe('student')
    expect(resolveProfileRole(firstChoice, 'instructor')).toBe('student')
  })

  it('returns the existing role only when it differs from the chosen role', () => {
    expect(getRoleMismatch('student', 'instructor')).toBe('instructor')
    expect(getRoleMismatch('student', 'student')).toBeNull()
    expect(getRoleMismatch('student', null)).toBeNull()
    expect(getRoleMismatch(null, 'instructor')).toBeNull()
  })
})
