import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../schemas/settings'
import { validateQuizForm } from './validation'

describe('quiz form validation', () => {
  it('requires a nonblank title and enforces the title limit', () => {
    const base = { description: '', tags: '', mode: 'quiz' as const, settings: defaultQuizSettings('quiz') }
    expect(validateQuizForm({ ...base, title: '  ' }).title).toBe('Enter a quiz title.')
    expect(validateQuizForm({ ...base, title: 'x'.repeat(121) }).title).toContain('120')
    expect(validateQuizForm({ ...base, title: ' Biology ' })).toEqual({})
  })
  it('validates settings with the strict domain rules', () => {
    const settings = { ...defaultQuizSettings('quiz'), participation: { type: 'group' as const, groupSize: 1 } }
    expect(validateQuizForm({ title: 'Quiz', description: '', tags: '', mode: 'quiz', settings }).settings).toContain('groupSize')
  })
})
