import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { DomainValidationError, parseQuiz, parseQuestion, validateQuestionAnswerPair } from './index'
import { defaultQuizSettings } from './settings'

const time = Timestamp.fromMillis(1000)
const quiz = (mode: 'quiz' | 'flashcards' = 'quiz') => ({
  ownerId: 'teacher', ownerName: 'Teacher', title: '', description: '', tags: [], mode,
  status: 'draft', questionCount: 0, createdAt: time, updatedAt: time, publishedAt: null,
  settings: defaultQuizSettings(mode),
})

describe('quiz runtime schemas', () => {
  it('parses standard quiz and neutral flashcard settings', () => {
    expect(parseQuiz(quiz()).mode).toBe('quiz')
    expect(parseQuiz(quiz('flashcards')).settings).toMatchObject({ answerReveal: 'never', scoreVisibility: 'hidden', scoresReleased: false })
  })

  it('rejects invalid settings, dates, group sizes, and non-neutral flashcard settings', () => {
    expect(() => parseQuiz({ ...quiz(), settings: { ...defaultQuizSettings('quiz'), participation: { type: 'group', groupSize: 11 } } })).toThrow(DomainValidationError)
    expect(() => parseQuiz({ ...quiz('flashcards'), settings: { ...defaultQuizSettings('quiz'), answerReveal: 'after_each' } })).toThrow('neutral')
    expect(() => parseQuiz({ ...quiz(), createdAt: 1 })).toThrow('Firestore timestamp')
  })

  it('rejects question answer fields, malformed options, and answer-key mismatches', () => {
    expect(() => parseQuestion({ type: 'multiple_choice', order: 0, prompt: 'Pick', points: 1, options: [], answer: 'a' })).toThrow()
    expect(() => validateQuestionAnswerPair(
      { type: 'multiple_choice', order: 0, prompt: 'Pick', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
      { type: 'choice', correctOptionId: 'c', explanation: '', caseSensitive: false },
    )).toThrow('match an option id')
  })

  it('checks fill-blank keys against prompt blanks', () => {
    expect(() => validateQuestionAnswerPair(
      { type: 'fill_blank', order: 0, prompt: '___ then ___', points: 2 },
      { type: 'fill_blank', blanks: [['one']], explanation: '', caseSensitive: false },
    )).toThrow('blank count')
  })

  it('limits multiple-choice options to six', () => {
    expect(() => parseQuestion({
      type: 'multiple_choice', order: 0, prompt: 'Pick', points: 1,
      options: Array.from({ length: 7 }, (_, index) => ({ id: String(index), text: `Option ${index}` })),
    })).toThrow('2–6 options')
  })
})
