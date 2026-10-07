import { describe, expect, it } from 'vitest'
import { createInviteCode, normalizeLearningInviteCode } from './inviteCodes'

describe('learning invite codes', () => {
  it('generates a readable eight-character code', () => {
    expect(createInviteCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('normalizes spaces, separators, and letter case before lookup', () => {
    expect(normalizeLearningInviteCode(' abcd-2345 ')).toBe('ABCD2345')
  })
})
