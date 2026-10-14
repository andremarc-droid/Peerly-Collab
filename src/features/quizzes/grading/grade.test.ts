import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { gradeAttempt } from './grade'
import type { AnswerKey, QuizQuestion } from '../types'
import type { CanvasQuestion } from '../../canvas/types'

const questions: QuizQuestion[] = [
  { type: 'multiple_choice', order: 0, prompt: 'Choose', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
  { type: 'true_false', order: 1, prompt: 'True?', points: 1, options: [{ id: 't', text: 'True' }, { id: 'f', text: 'False' }] },
  { type: 'identification', order: 2, prompt: 'Name it', points: 3 },
  { type: 'fill_blank', order: 3, prompt: 'Fill', points: 4 },
  { type: 'flashcard', order: 4, prompt: 'Front', points: 5 },
]
const keys: Record<string, AnswerKey> = {
  q0: { type: 'choice', correctOptionId: 'b', explanation: '', caseSensitive: false },
  q1: { type: 'choice', correctOptionId: 'f', explanation: '', caseSensitive: false },
  q2: { type: 'identification', acceptedAnswers: ['New York', 'NYC'], explanation: '', caseSensitive: false },
  q3: { type: 'fill_blank', blanks: [['alpha'], ['beta']], explanation: '', caseSensitive: false },
  q4: { type: 'flashcard', back: 'Back', explanation: '', caseSensitive: false },
}
const mappedQuestions = questions.map((question, index) => ({ ...question, id: `q${index}` })) as (QuizQuestion & { id: string })[]

describe('calculateGrade', () => {
  it('grades all question types with case and whitespace normalization and excludes flashcards', () => {
    const grade = gradeAttempt({ userId: 'student', questions: mappedQuestions, answerKeys: keys, answers: { q0: 'b', q1: 'f', q2: '  NEW   YORK ', q3: ['ALPHA', 'beta'] }, gradedAt: Timestamp.now() })
    expect(grade.score).toBe(10)
    expect(grade.maxScore).toBe(10)
    expect(grade.perQuestion.q4).toEqual({ correct: null, pointsAwarded: 0, overridden: false })
  })

  it('awards partial blank credit and marks the question incorrect', () => {
    const grade = gradeAttempt({ userId: 'student', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha', 'wrong'] }, gradedAt: Timestamp.now() })
    expect(grade.perQuestion.q3).toEqual({ correct: false, pointsAwarded: 2, overridden: false })
  })

  it('requires every fill blank and rejects extra answers', () => {
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha'] }, gradedAt: Timestamp.now() }).perQuestion.q3.correct).toBe(false)
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: { q3: ['alpha', 'beta', 'extra'] }, gradedAt: Timestamp.now() }).perQuestion.q3.pointsAwarded).toBe(4)
  })

  it('respects caseSensitive and never accepts a wrong or absent option id', () => {
    const sensitive = { ...keys, q2: { ...keys.q2, caseSensitive: true } as AnswerKey }
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: sensitive, answers: { q2: 'new york', q0: 'A' }, gradedAt: Timestamp.now() }).perQuestion.q2.correct).toBe(false)
    expect(gradeAttempt({ userId: 's', questions: mappedQuestions, answerKeys: keys, answers: {}, gradedAt: Timestamp.now() }).perQuestion.q0.pointsAwarded).toBe(0)
  })

  it('fails clearly when a graded question has no answer key', () => {
    expect(() => gradeAttempt({ userId: 's', questions: [mappedQuestions[0]], answerKeys: {}, answers: {}, gradedAt: Timestamp.now() })).toThrow('Missing answer key')
  })

  it.each([
    { points: 1, blankCount: 6, expectedPoints: 1 },
    { points: 2, blankCount: 7, expectedPoints: 2 },
    { points: 7, blankCount: 6, expectedPoints: 7 },
    { points: 12, blankCount: 7, expectedPoints: 12 },
  ])('correctly grades points: $points, blanks: $blankCount without float inaccuracy', ({ points, blankCount, expectedPoints }) => {
    const blanks = Array.from({ length: blankCount }, (_, i) => [`ans${i}`])
    const question: QuizQuestion & { id: string } = {
      id: 'fb',
      type: 'fill_blank',
      order: 0,
      prompt: 'Fill blanks',
      points,
    }
    const key: Record<string, AnswerKey> = {
      fb: { type: 'fill_blank', blanks, explanation: '', caseSensitive: false },
    }
    const fullAnswers = Array.from({ length: blankCount }, (_, i) => `ans${i}`)
    const fullGrade = gradeAttempt({
      userId: 's',
      questions: [question],
      answerKeys: key,
      answers: { fb: fullAnswers },
      gradedAt: Timestamp.now(),
    })
    expect(fullGrade.perQuestion.fb.correct).toBe(true)
    expect(fullGrade.perQuestion.fb.pointsAwarded).toBe(expectedPoints)
    expect(fullGrade.score).toBe(expectedPoints)

    // Partial answer: only 1 blank correct
    const partialAnswers = [`ans0`, ...Array.from({ length: blankCount - 1 }, () => 'wrong')]
    const partialGrade = gradeAttempt({
      userId: 's',
      questions: [question],
      answerKeys: key,
      answers: { fb: partialAnswers },
      gradedAt: Timestamp.now(),
    })
    expect(partialGrade.perQuestion.fb.correct).toBe(false)
    expect(partialGrade.perQuestion.fb.pointsAwarded).toBe(Math.round((1 / blankCount) * points * 100) / 100)
  })
})

describe('gradeAttempt canvas mode', () => {
  const cards = [
    { id: 'c1', type: 'note' as const, content: '1', position: { x: 0, y: 0 } },
    { id: 'c2', type: 'note' as const, content: '2', position: { x: 0, y: 0 } },
    { id: 'c3', type: 'note' as const, content: '3', position: { x: 0, y: 0 } },
    { id: 'c4', type: 'note' as const, content: '4', position: { x: 0, y: 0 } },
  ]

  const canvasQuestion = (overrides?: Partial<CanvasQuestion>): QuizQuestion & { id: string } => ({
    id: 'board',
    type: 'canvas',
    order: 0,
    prompt: 'Connect concepts',
    points: 100,
    layoutMode: 'scattered',
    directed: true,
    wrongPenalty: 'half',
    cards,
    ...overrides,
  })

  const canvasKey = (connections = [
    { id: 'k1', from: 'c1', to: 'c2', points: 1 },
    { id: 'k2', from: 'c2', to: 'c3', points: 1 },
    { id: 'k3', from: 'c3', to: 'c4', points: 1 },
    { id: 'k4', from: 'c4', to: 'c1', points: 1 },
  ]): Record<string, AnswerKey> => ({
    board: {
      type: 'canvas',
      explanation: 'Cycle connection',
      connections,
    },
  })

  it('grades perfect submission with full points and correct = true', () => {
    const q = canvasQuestion()
    const keys = canvasKey()
    const grade = gradeAttempt({
      userId: 'student',
      questions: [q],
      answerKeys: keys,
      answers: { board: ['c1->c2', 'c2->c3', 'c3->c4', 'c4->c1'] },
      gradedAt: Timestamp.now(),
    })

    expect(grade.score).toBe(100)
    expect(grade.maxScore).toBe(100)
    expect(grade.perQuestion.board).toEqual({ correct: true, pointsAwarded: 100, overridden: false })
  })

  it('grades partial submission with partial points and correct = false', () => {
    const q = canvasQuestion({ wrongPenalty: 'none' })
    const keys = canvasKey()
    const grade = gradeAttempt({
      userId: 'student',
      questions: [q],
      answerKeys: keys,
      answers: { board: ['c1->c2', 'c2->c3'] }, // 2 of 4 correct
      gradedAt: Timestamp.now(),
    })

    expect(grade.score).toBe(50)
    expect(grade.perQuestion.board).toEqual({ correct: false, pointsAwarded: 50, overridden: false })
  })

  it('applies wrong penalty policies: none, half, and full with floor 0', () => {
    const keys = canvasKey() // 4 connections, avg 1.0
    // Student has 2 correct ('c1->c2', 'c2->c3') and 2 wrong ('c1->c3', 'c2->c4')
    const answers = { board: ['c1->c2', 'c2->c3', 'c1->c3', 'c2->c4'] }

    // Penalty 'none': matched 2, penalty 0 => 2/4 * 100 = 50
    const gradeNone = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'none' })],
      answerKeys: keys,
      answers,
      gradedAt: Timestamp.now(),
    })
    expect(gradeNone.perQuestion.board?.pointsAwarded).toBe(50)

    // Penalty 'half': matched 2, penalty 2 * (0.5 * 1.0) = 1.0 => net 1.0 => 1/4 * 100 = 25
    const gradeHalf = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'half' })],
      answerKeys: keys,
      answers,
      gradedAt: Timestamp.now(),
    })
    expect(gradeHalf.perQuestion.board?.pointsAwarded).toBe(25)

    // Penalty 'full': matched 2, penalty 2 * (1.0 * 1.0) = 2.0 => net 0 => 0
    const gradeFull = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'full' })],
      answerKeys: keys,
      answers,
      gradedAt: Timestamp.now(),
    })
    expect(gradeFull.perQuestion.board?.pointsAwarded).toBe(0)

    // Floor 0 test: 1 correct, 3 wrong with 'full' => net = 1 - 3 = -2 => floored to 0
    const gradeFloor = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'full' })],
      answerKeys: keys,
      answers: { board: ['c1->c2', 'c1->c3', 'c2->c4', 'c3->c1'] },
      gradedAt: Timestamp.now(),
    })
    expect(gradeFloor.perQuestion.board?.pointsAwarded).toBe(0)
  })

  it('differentiates directed vs undirected connections', () => {
    const keys = canvasKey([{ id: 'k1', from: 'c1', to: 'c2', points: 1 }])

    // Directed: reverse connection 'c2->c1' is wrong
    const directedGrade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ directed: true, wrongPenalty: 'none' })],
      answerKeys: keys,
      answers: { board: ['c2->c1'] },
      gradedAt: Timestamp.now(),
    })
    expect(directedGrade.perQuestion.board?.pointsAwarded).toBe(0)

    // Undirected: reverse connection 'c2->c1' normalizes to 'c1<->c2' and matches
    const undirectedGrade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ directed: false })],
      answerKeys: keys,
      answers: { board: ['c2->c1'] },
      gradedAt: Timestamp.now(),
    })
    expect(undirectedGrade.perQuestion.board?.pointsAwarded).toBe(100)
    expect(undirectedGrade.perQuestion.board?.correct).toBe(true)
  })

  it('ignores duplicate submissions and self-connections', () => {
    const keys = canvasKey([{ id: 'k1', from: 'c1', to: 'c2', points: 1 }])
    // Student submits duplicates and self-connection
    const grade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion()],
      answerKeys: keys,
      answers: { board: ['c1->c1', 'c1->c2', 'c1->c2', 'c1->c2'] },
      gradedAt: Timestamp.now(),
    })

    expect(grade.perQuestion.board?.pointsAwarded).toBe(100)
    expect(grade.perQuestion.board?.correct).toBe(true)
  })

  it('enforces connection cap: min(80, 2 x key count)', () => {
    // 2 key connections => cap is 4
    const keys = canvasKey([
      { id: 'k1', from: 'c1', to: 'c2', points: 1 },
      { id: 'k2', from: 'c2', to: 'c3', points: 1 },
    ])
    // 2 correct + 4 wrong (total 6) with penalty 'full'
    // Under cap of 4: 2 correct, 2 wrong evaluated => net = 2 - 2 = 0 points
    // If cap was not enforced, 4 wrong would subtract 4 (net -2 -> 0), but let's verify cap limits wrong evaluated
    const grade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'half' })],
      answerKeys: keys,
      answers: {
        board: ['c1->c2', 'c2->c3', 'c1->c4', 'c3->c1', 'c3->c2', 'c4->c3'],
      },
      gradedAt: Timestamp.now(),
    })

    // 2 correct (2 pts), 2 wrong evaluated (penalty: 2 * 0.5 * 1.0 = 1.0 pt), 5th and 6th ignored. Net = 1.0 pt / 2.0 = 50 pts.
    expect(grade.perQuestion.board?.pointsAwarded).toBe(50)
  })

  it('handles empty submission gracefully', () => {
    const grade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion()],
      answerKeys: canvasKey(),
      answers: {},
      gradedAt: Timestamp.now(),
    })

    expect(grade.perQuestion.board).toEqual({ correct: false, pointsAwarded: 0, overridden: false })
    expect(grade.score).toBe(0)
  })

  it('ignores student connections with unknown card IDs without penalty or using the cap', () => {
    const keys = canvasKey([{ id: 'k1', from: 'c1', to: 'c2', points: 1 }])
    const grade = gradeAttempt({
      userId: 's',
      questions: [canvasQuestion({ wrongPenalty: 'full' })],
      answerKeys: keys,
      answers: { board: ['c1->c2', 'unknownA->unknownB', 'c1->unknownB'] },
      gradedAt: Timestamp.now(),
    })

    expect(grade.perQuestion.board?.pointsAwarded).toBe(100)
    expect(grade.perQuestion.board?.correct).toBe(true)
  })
})
