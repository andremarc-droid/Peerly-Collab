import { describe, expect, it, vi } from 'vitest'
import { buildQuiz, localDistractors } from './quiz'
import { sanitizeAiDistractors } from './quizAi'
import type { StudyCard } from './queue'

const cards: StudyCard[] = [
  { id: 'a', front: 'A?', back: 'Alpha' },
  { id: 'b', front: 'B?', back: 'Beta' },
  { id: 'c', front: 'C?', back: 'Gamma' },
]

describe('buildQuiz', () => {
  it('includes the correct answer and removes duplicate distractors', async () => {
    const result = await buildQuiz(cards, undefined, false, undefined, 3, () => 0)
    expect(result.questions[0]?.options).toContain('Alpha')
    expect(new Set(result.questions[0]?.options).size).toBe(3)
  })
  it('uses written mode for a one-card deck', async () => {
    const result = await buildQuiz(cards.slice(0, 1), ['multiple-choice'])
    expect(result.questions[0]?.kind).toBe('written')
  })
  it('cycles through requested question kinds', async () => {
    const result = await buildQuiz(cards, ['written', 'multiple-choice'], false, undefined, 3, () => 0.99)
    expect(result.questions.map(question => question.kind)).toEqual(['written', 'multiple-choice', 'written'])
  })
  it('caps requested count at the available cards', async () => {
    const result = await buildQuiz(cards, ['written'], false, undefined, 40, () => 0.99)
    expect(result.questions).toHaveLength(3)
  })
  it('caps generated quiz length at fifty questions', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({ id: `id-${index}`, front: `front ${index}`, back: `back ${index}` }))
    const result = await buildQuiz(many, ['written'], false, undefined, 60, () => 0.99)
    expect(result.questions).toHaveLength(50)
  })
  it('selects cards using the injected random function', async () => {
    const result = await buildQuiz(cards, ['written'], false, undefined, 1, () => 0)
    expect(result.questions[0]?.cardId).toBe('b')
  })
  it('shuffles options instead of alphabetizing them', async () => {
    const result = await buildQuiz(cards, ['multiple-choice'], false, undefined, 3, () => 0)
    expect(result.questions[0]?.options).toEqual(['Gamma', 'Alpha', 'Beta'])
  })
  it('requests AI distractors only for multiple choice cards', async () => {
    const generate = vi.fn().mockResolvedValue({})
    await buildQuiz(cards, ['written', 'multiple-choice'], true, generate, 3, () => 0.99)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0]?.[0]).toHaveLength(1)
    expect(generate.mock.calls[0]?.[0][0]?.id).toBe('b')
  })
  it('retains earlier AI output and falls back locally when a later batch fails', async () => {
    const many = Array.from({ length: 16 }, (_, index) => ({ id: `x${index}`, front: `Q${index}`, back: `A${index}` }))
    const generate = vi.fn().mockResolvedValueOnce({ x0: ['Wrong'] }).mockRejectedValueOnce(new Error())
    const result = await buildQuiz(many, ['multiple-choice'], true, generate, 16, () => 0.99)
    expect(result.notice).toMatch(/AI distractors were unavailable/)
    expect(result.questions.find(question => question.cardId === 'x0')?.options).toContain('Wrong')
  })
  it('returns no questions for an empty deck or zero count', async () => {
    expect((await buildQuiz([], undefined)).questions).toEqual([])
    expect((await buildQuiz(cards, undefined, false, undefined, 0)).questions).toEqual([])
  })
})

describe('localDistractors', () => {
  it('chooses unique answers from other cards', () => {
    expect(localDistractors(cards[0]!, cards, () => 0)).toEqual(['Gamma', 'Beta'])
  })
})

describe('sanitizeAiDistractors', () => {
  it('drops unknown ids, blank answers, duplicates and the correct answer', () => {
    expect(sanitizeAiDistractors({ a: ['Alpha', ' beta ', 'BETA', '', 'Other'], unknown: ['Extra'] }, cards))
      .toEqual({ a: ['beta', 'Other'] })
  })
  it('caps each distractor at 300 characters and keeps at most three', () => {
    expect(sanitizeAiDistractors({ a: ['x'.repeat(301), 'one', 'two', 'three', 'four'] }, cards).a)
      .toEqual(['one', 'two', 'three'])
  })
})
