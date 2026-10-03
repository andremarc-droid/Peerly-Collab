import { describe, expect, it } from 'vitest'
import { validateQuestionAnswerPair } from '../schemas'
import { createQuestionDraft, detectBlankCount, moveQuestion, validateQuestionDraft } from './questionDraft'
import { toQuestionPair } from './questionDraft'

describe('question drafts', () => {
  it('validates each answer format with clear required fields', () => {
    const choice = createQuestionDraft('multiple_choice')
    expect(validateQuestionDraft(choice, 'quiz').options).toBe('Add 2–6 non-empty options.')
    choice.prompt = 'Which?'
    choice.options[0].text = 'A'
    choice.options[1].text = 'B'
    choice.options[0].correct = true
    expect(validateQuestionDraft(choice, 'quiz')).toEqual({})
    expect(validateQuestionDraft(createQuestionDraft('identification'), 'quiz').acceptedAnswers).toBe('Add at least one accepted answer.')
    expect(validateQuestionDraft(createQuestionDraft('flashcard'), 'flashcards').back).toBe('Enter the back of the flashcard.')
  })

  it('checks choice limits, exact correctness, identification, true/false, and mode matching', () => {
    const choice = createQuestionDraft('multiple_choice')
    choice.prompt = 'Pick one'
    choice.options = Array.from({ length: 7 }, (_, index) => ({ id: String(index), text: 'Choice', correct: index === 0 }))
    expect(validateQuestionDraft(choice, 'quiz').options).toContain('2–6')
    choice.options = [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: true }]
    expect(validateQuestionDraft(choice, 'quiz').options).toBe('Mark the correct option.')
    const trueFalse = createQuestionDraft('true_false')
    expect(trueFalse.options.map(({ text }) => text)).toEqual(['True', 'False'])
    trueFalse.prompt = 'The Earth is round.'
    trueFalse.options[1].correct = true
    expect(validateQuestionDraft(trueFalse, 'quiz')).toEqual({})
    expect(validateQuestionDraft(createQuestionDraft('flashcard'), 'quiz').type).toContain('match')
  })

  it('accepts identification answers as a list and rejects a missing answer', () => {
    const draft = createQuestionDraft('identification')
    draft.prompt = 'Name the largest planet.'
    draft.acceptedAnswers = 'Jupiter\nJove'
    expect(validateQuestionDraft(draft, 'quiz')).toEqual({})
    draft.acceptedAnswers = '\n '
    expect(validateQuestionDraft(draft, 'quiz').acceptedAnswers).toBe('Add at least one accepted answer.')
  })

  it('detects each triple-underscore blank and validates its answer list', () => {
    expect(detectBlankCount('___ plus ___ makes five')).toBe(2)
    const draft = createQuestionDraft('fill_blank')
    draft.prompt = '___ plus ___ makes five'
    draft.blankAnswers = ['2', '3']
    expect(validateQuestionDraft(draft, 'quiz')).toEqual({})
    draft.blankAnswers[1] = ''
    expect(validateQuestionDraft(draft, 'quiz').blanks).toBe('Add at least one accepted answer for each blank.')
  })

  it('moves questions in either direction without mutating the source', () => {
    const source = ['one', 'two', 'three']
    expect(moveQuestion(source, 0, 2)).toEqual(['two', 'three', 'one'])
    expect(moveQuestion(source, 2, 0)).toEqual(['three', 'one', 'two'])
    expect(source).toEqual(['one', 'two', 'three'])
    expect(moveQuestion(source, 1, 8)).toBe(source)
  })

  it('converts every supported builder type into a valid question and answer key pair', () => {
    const multipleChoice = createQuestionDraft('multiple_choice')
    Object.assign(multipleChoice, { prompt: 'Pick one', options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: false }] })
    const trueFalse = createQuestionDraft('true_false')
    Object.assign(trueFalse, { prompt: 'True?', options: [{ id: 't', text: 'True', correct: true }, { id: 'f', text: 'False', correct: false }] })
    const identification = createQuestionDraft('identification')
    Object.assign(identification, { prompt: 'Planet?', acceptedAnswers: 'Earth\nTerra' })
    const fillBlank = createQuestionDraft('fill_blank')
    Object.assign(fillBlank, { prompt: '___ is blue', blankAnswers: ['The sky'] })
    const flashcard = createQuestionDraft('flashcard')
    Object.assign(flashcard, { prompt: 'Front', back: 'Back' })

    for (const draft of [multipleChoice, trueFalse, identification, fillBlank]) {
      const pair = toQuestionPair(draft, 0)
      expect(validateQuestionAnswerPair(pair.question, pair.answerKey)).toBeDefined()
    }
    const card = toQuestionPair(flashcard, 0)
    expect(validateQuestionAnswerPair(card.question, card.answerKey).question.type).toBe('flashcard')
  })
})
