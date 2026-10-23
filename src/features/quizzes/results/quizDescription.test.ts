import { describe, expect, it } from 'vitest'
import { describeQuizForResults, type DescribableQuiz } from './quizDescription'

const quiz = (overrides: Partial<DescribableQuiz> = {}, settings: Partial<DescribableQuiz['settings']> = {}): DescribableQuiz => ({
  title: 'Cells',
  mode: 'quiz',
  questionCount: 2,
  ...overrides,
  settings: { participation: { type: 'individual' }, timeLimitMinutes: null, timeLimitSeconds: null, attemptsAllowed: 1, ...settings },
})
const group = { type: 'group' as const, groupSize: 4, answerMode: 'everyone' as const, teamFormation: 'self' as const, waitForEveryone: true, questionTimeSec: null }

describe('describeQuizForResults', () => {
  it('describes an individual, untimed quiz in two short lines', () => {
    expect(describeQuizForResults(quiz(), 'Biology')).toEqual({
      title: 'Cells',
      typeLabel: 'Quiz',
      details: ['Biology · 2 questions · Individual', 'No time limit · 1 attempt'],
      facts: { questions: '2 questions', participation: 'Individual', timeLimit: 'No time limit', attempts: '1 attempt' },
    })
  })

  it('pluralizes the question count', () => {
    expect(describeQuizForResults(quiz({ questionCount: 1 }), 'Biology').facts.questions).toBe('1 question')
    expect(describeQuizForResults(quiz({ questionCount: 0 }), 'Biology').facts.questions).toBe('0 questions')
  })

  it('describes a group quiz by its maximum team size', () => {
    expect(describeQuizForResults(quiz({}, { participation: group }), 'Biology').details[0]).toBe('Biology · 2 questions · Group of up to 4')
  })

  it('uses the group question timer when the group quiz has one', () => {
    const described = describeQuizForResults(quiz({}, { participation: { ...group, questionTimeSec: 45 } }), 'Biology')
    expect(described.facts.timeLimit).toBe('45 seconds per question')
  })

  it('shows the exact per-question time limit, falling back to minutes for older quizzes', () => {
    expect(describeQuizForResults(quiz({}, { timeLimitMinutes: 2, timeLimitSeconds: 90 }), 'Biology').facts.timeLimit).toBe('1 minute 30 seconds per question')
    expect(describeQuizForResults(quiz({}, { timeLimitMinutes: 3, timeLimitSeconds: undefined }), 'Biology').facts.timeLimit).toBe('3 minutes per question')
  })

  it('distinguishes unlimited from numbered attempts', () => {
    expect(describeQuizForResults(quiz({}, { attemptsAllowed: null }), 'Biology').details[1]).toBe('No time limit · Unlimited attempts')
    expect(describeQuizForResults(quiz({}, { attemptsAllowed: 3 }), 'Biology').facts.attempts).toBe('3 attempts')
  })

  it('describes flashcards by card count, without any scoring details', () => {
    const described = describeQuizForResults(quiz({ mode: 'flashcards', questionCount: 1 }, { attemptsAllowed: null }), 'Biology')
    expect(described.typeLabel).toBe('Flashcards')
    expect(described.details).toEqual(['Biology · 1 card · Individual', 'No time limit · Unlimited attempts'])
    expect(described.details.join(' ')).not.toMatch(/score|point|grade/i)
  })

  it('leaves the time limit out for a canvas activity', () => {
    const described = describeQuizForResults(quiz({ mode: 'canvas' }, { timeLimitMinutes: 1, timeLimitSeconds: 60 }), 'Biology')
    expect(described.facts.timeLimit).toBeNull()
    expect(described.details[1]).toBe('1 attempt')
  })

  it('names an untitled quiz', () => {
    expect(describeQuizForResults(quiz({ title: '   ' }), 'Biology').title).toBe('Untitled quiz')
  })
})
