import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../schemas/settings'
import { parseQuestionsFromText, publishChecklist, settingsForPreset } from './textParser'

describe('quiz authoring helpers', () => {
  it('parses numbered multiple choice with marked answer and identification formats', () => {
    expect(parseQuestionsFromText('1. Capital?\na) Rome\n*b) Paris\n\n2) Planet?\nAnswer: Mars')).toEqual([
      { type: 'multiple_choice', prompt: 'Capital?', options: [{ text: 'Rome', correct: false }, { text: 'Paris', correct: true }], answer: '' },
      { type: 'identification', prompt: 'Planet?', options: [], answer: 'Mars' },
    ])
  })
  it('reports malformed blocks and supports alternate option punctuation', () => {
    expect(parseQuestionsFromText('Question?\nA. one\nB. two')[0]?.error).toContain('exactly one')
    expect(parseQuestionsFromText('Question?\na) one\n*b) two')[0]?.error).toBeUndefined()
    expect(parseQuestionsFromText('Question?')[0]?.error).toContain('Answer:')
  })
  it('maps presets to existing settings fields and checks publish readiness', () => {
    expect(settingsForPreset('practice', defaultQuizSettings('quiz'))).toMatchObject({ answerReveal: 'after_each', scoreVisibility: 'immediate', attemptsAllowed: null, timeLimitMinutes: null })
    expect(settingsForPreset('graded', defaultQuizSettings('quiz'))).toMatchObject({ answerReveal: 'after_submit', scoreVisibility: 'after_release', attemptsAllowed: 1, shuffleQuestions: true, shuffleOptions: true })
    expect(publishChecklist({ title: 'Quiz', questionCount: 1, classId: 'class' }).ready).toBe(true)
    expect(publishChecklist({ title: ' ', questionCount: 1, classId: 'class' }).ready).toBe(false)
  })
})
