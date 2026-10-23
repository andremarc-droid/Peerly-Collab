import { describe, expect, it } from 'vitest'
import { isUnder18DefaultOff, validateScoreboardDisplayName } from './schemas'

describe('scoreboard validation & privacy rules', () => {
  describe('isUnder18DefaultOff', () => {
    it('returns false (opted out by default) for students under 18', () => {
      expect(isUnder18DefaultOff('student', 17)).toBe(false)
      expect(isUnder18DefaultOff('student', 12)).toBe(false)
    })

    it('returns true (opted in by default) for adults and instructors', () => {
      expect(isUnder18DefaultOff('student', 18)).toBe(true)
      expect(isUnder18DefaultOff('student', 25)).toBe(true)
      expect(isUnder18DefaultOff('instructor', 17)).toBe(true)
      expect(isUnder18DefaultOff('student', null)).toBe(true)
      expect(isUnder18DefaultOff(null, null)).toBe(true)
    })
  })

  describe('validateScoreboardDisplayName', () => {
    it('rejects names that are too short or too long', () => {
      expect(validateScoreboardDisplayName('a')).toEqual({
        valid: false,
        error: 'Display name must be at least 2 characters.',
      })
      expect(validateScoreboardDisplayName('a'.repeat(31))).toEqual({
        valid: false,
        error: 'Display name must be 30 characters or less.',
      })
    })

    it('rejects reserved system names', () => {
      expect(validateScoreboardDisplayName('admin')).toEqual({
        valid: false,
        error: 'This display name is reserved. Please choose another.',
      })
      expect(validateScoreboardDisplayName('PEERLY')).toEqual({
        valid: false,
        error: 'This display name is reserved. Please choose another.',
      })
      expect(validateScoreboardDisplayName('moderator')).toEqual({
        valid: false,
        error: 'This display name is reserved. Please choose another.',
      })
    })

    it('rejects profanity', () => {
      expect(validateScoreboardDisplayName('badshit123')).toEqual({
        valid: false,
        error: 'Display name contains inappropriate language.',
      })
    })

    it('accepts clean, valid display names', () => {
      expect(validateScoreboardDisplayName('StarLearner')).toEqual({ valid: true })
      expect(validateScoreboardDisplayName('Biology_Whiz')).toEqual({ valid: true })
    })
  })
})
