import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../schemas/settings'
import type { GroupParticipation, QuizSettings } from '../types'
import { defaultGroupParticipation } from './groupSettingsLogic'
import { validateQuizForm, type QuizFormValues } from './validation'

const form = (participation: QuizSettings['participation']): QuizFormValues => ({
  classId: 'class-1', title: 'Team quiz', description: '', tags: '', mode: 'quiz', settings: { ...defaultQuizSettings('quiz'), participation },
})
const group = (patch: Partial<GroupParticipation> = {}): GroupParticipation => ({ ...defaultGroupParticipation(), ...patch })

describe('validateQuizForm with group participation', () => {
  it('accepts the default group setup and a fully configured one', () => {
    expect(validateQuizForm(form(group()))).toEqual({})
    expect(validateQuizForm(form(group({ groupSize: 10, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 300 })))).toEqual({})
  })
  it('still accepts individual quizzes', () => {
    expect(validateQuizForm(form({ type: 'individual' }))).toEqual({})
  })
  it.each([[1], [11], [Number.NaN], [2.5]])('blocks saving with a team size of %s and points at the group settings', size => {
    expect(validateQuizForm(form(group({ groupSize: size }))).settings).toMatch(/Fix the group settings.*2 to 10/)
  })
  it.each([[9], [301], [Number.NaN], [20.5]])('blocks saving with a timer of %s seconds', seconds => {
    expect(validateQuizForm(form(group({ questionTimeSec: seconds }))).settings).toMatch(/Fix the group settings.*10 to 300/)
  })
  it('keeps other field errors alongside a group error', () => {
    const errors = validateQuizForm({ ...form(group({ groupSize: 1 })), title: '' })
    expect(errors.title).toBeTruthy()
    expect(errors.settings).toBeTruthy()
  })
  it('rejects group participation for flashcards', () => {
    const baseFlashcards = defaultQuizSettings('flashcards')
    expect(validateQuizForm({ classId: 'c', title: 'T', description: '', tags: '', mode: 'flashcards', settings: { ...baseFlashcards, participation: group() } }).settings).toMatch(/Only quizzes/)
  })
})
