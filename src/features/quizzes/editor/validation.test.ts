import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../schemas/settings'
import type { QuizSettings } from '../types'
import { validateQuizForm } from './validation'

describe('quiz form validation', () => {
  it('requires a nonblank title and enforces the title limit', () => {
    const base = { classId: 'class-a', description: '', tags: '', mode: 'quiz' as const, settings: defaultQuizSettings('quiz') }
    expect(validateQuizForm({ ...base, title: '  ' }).title).toBe('Enter a quiz title.')
    expect(validateQuizForm({ ...base, title: 'x'.repeat(121) }).title).toContain('120')
    expect(validateQuizForm({ ...base, title: ' Biology ' })).toEqual({})
  })
  it('blocks a team size outside 2-10 with a plain-language message', () => {
    const settings = {
      ...defaultQuizSettings('quiz'),
      participation: { type: 'group' as const, groupSize: 1, answerMode: 'representative' as const, teamFormation: 'assigned' as const, waitForEveryone: false, questionTimeSec: null },
    }
    const message = validateQuizForm({ classId: 'class-a', title: 'Quiz', description: '', tags: '', mode: 'quiz', settings }).settings
    expect(message).toContain('Fix the group settings')
    expect(message).toContain('2 to 10')
  })
  it('still applies the strict domain rules to everything else', () => {
    const settings = { ...defaultQuizSettings('quiz'), answerReveal: 'sometimes' } as unknown as QuizSettings
    expect(validateQuizForm({ classId: 'class-a', title: 'Quiz', description: '', tags: '', mode: 'quiz', settings }).settings).toContain('answerReveal')
  })
  it('requires an active class assignment before saving', () => {
    expect(validateQuizForm({ classId: '', title: 'Quiz', description: '', tags: '', mode: 'quiz', settings: defaultQuizSettings('quiz') }).classId).toBe('Choose a class before saving this quiz.')
  })
})
