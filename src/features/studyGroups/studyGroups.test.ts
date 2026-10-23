import { describe, expect, it } from 'vitest'
import {
  generateGroupInviteCode,
  GROUP_CODE_ALPHABET,
  GROUP_CODE_LENGTH,
  normalizeGroupInviteCode,
  validateGroupDescription,
  validateGroupName,
} from './schemas'

describe('studyGroups schemas & utilities', () => {
  it('generates a 6-character code from the standard alphabet', () => {
    const code = generateGroupInviteCode()
    expect(code).toHaveLength(GROUP_CODE_LENGTH)
    for (const char of code) {
      expect(GROUP_CODE_ALPHABET).toContain(char)
    }
  })

  it('normalizes invite codes by uppercasing and stripping hyphens/whitespace', () => {
    expect(normalizeGroupInviteCode(' ab-cd-ef ')).toBe('ABCDEF')
    expect(normalizeGroupInviteCode('234-xyz')).toBe('234XYZ')
  })

  it('validates group name lengths properly', () => {
    expect(validateGroupName('')).toEqual({ valid: false, error: 'Group name is required.' })
    expect(validateGroupName('   ')).toEqual({ valid: false, error: 'Group name is required.' })
    expect(validateGroupName('A'.repeat(81))).toEqual({
      valid: false,
      error: 'Group name must be 80 characters or less.',
    })
    expect(validateGroupName('Biology Study Group')).toEqual({ valid: true })
  })

  it('validates group description length', () => {
    expect(validateGroupDescription('')).toEqual({ valid: true })
    expect(validateGroupDescription(undefined)).toEqual({ valid: true })
    expect(validateGroupDescription('A'.repeat(301))).toEqual({
      valid: false,
      error: 'Description must be 300 characters or less.',
    })
    expect(validateGroupDescription('Weekly study group for exam prep')).toEqual({ valid: true })
  })
})
