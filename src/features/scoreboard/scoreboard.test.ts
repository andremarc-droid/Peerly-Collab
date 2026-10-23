import { describe, expect, it } from 'vitest'
import {
  computeCompetitionRanks,
  isUnder18DefaultOff,
  resolveAvatar,
  resolveDisplayName,
  resolveScoreboardOptIn,
  validateScoreboardDisplayName,
} from './schemas'

describe('scoreboard pure rules & competition ranking', () => {
  describe('resolveScoreboardOptIn', () => {
    it('handles student 17 and student 18 defaults', () => {
      expect(resolveScoreboardOptIn({ role: 'student', age: 17 })).toBe(false)
      expect(resolveScoreboardOptIn({ role: 'student', age: 18 })).toBe(true)
      expect(resolveScoreboardOptIn({ role: 'student', age: null })).toBe(true)
    })

    it('defaults adult and instructor to true', () => {
      expect(resolveScoreboardOptIn({ role: 'instructor', age: 17 })).toBe(true)
      expect(resolveScoreboardOptIn({ role: 'instructor', age: 40 })).toBe(true)
      expect(resolveScoreboardOptIn(null)).toBe(true)
    })

    it('explicit scoreboardOptIn always wins over default', () => {
      expect(resolveScoreboardOptIn({ role: 'student', age: 16, scoreboardOptIn: true })).toBe(true)
      expect(resolveScoreboardOptIn({ role: 'student', age: 25, scoreboardOptIn: false })).toBe(false)
      expect(resolveScoreboardOptIn({ role: 'instructor', age: 30, scoreboardOptIn: false })).toBe(false)
    })
  })

  describe('isUnder18DefaultOff', () => {
    it('returns false for students under 18, true otherwise', () => {
      expect(isUnder18DefaultOff('student', 17)).toBe(false)
      expect(isUnder18DefaultOff('student', 18)).toBe(true)
      expect(isUnder18DefaultOff('instructor', 16)).toBe(true)
    })
  })

  describe('resolveDisplayName and resolveAvatar', () => {
    it('falls back through custom -> displayName -> name -> default', () => {
      expect(resolveDisplayName({ scoreboardDisplayName: 'Custom' })).toBe('Custom')
      expect(resolveDisplayName({ displayName: 'Regular' })).toBe('Regular')
      expect(resolveDisplayName({ name: 'Raw' })).toBe('Raw')
      expect(resolveDisplayName({})).toBe('Peerly Learner')
    })

    it('resolves avatar or photoURL', () => {
      expect(resolveAvatar({ avatar: 'a.png' })).toBe('a.png')
      expect(resolveAvatar({ photoURL: 'b.png' })).toBe('b.png')
      expect(resolveAvatar({})).toBeNull()
    })
  })

  describe('computeCompetitionRanks', () => {
    it('assigns 1224 competition rank where equal points share rank and subsequent skips', () => {
      const items = [
        { points: 100, name: 'Alice' },
        { points: 100, name: 'Bob' },
        { points: 90, name: 'Charlie' },
        { points: 80, name: 'Dave' },
        { points: 80, name: 'Eve' },
        { points: 70, name: 'Frank' },
      ]

      const ranked = computeCompetitionRanks(items)
      expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 4, 4, 6])
    })

    it('handles single item and empty list', () => {
      expect(computeCompetitionRanks([])).toEqual([])
      expect(computeCompetitionRanks([{ points: 50 }])).toEqual([{ points: 50, rank: 1 }])
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
