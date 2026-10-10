import { describe, expect, it } from 'vitest'
import {
  GAME_LIMITS,
  GameInputError,
  actionForAdvance,
  applyAction,
  checkAnswerWindow,
  cleanDisplayName,
  everyoneAnswered,
  generateGameCode,
  normalizeGameCode,
  parseGameQuestions,
  parseOptionIndex,
  parseTimeLimit,
  questionsFromDeck,
  questionsFromLessonQuizzes,
  rankPlayers,
  scoreAnswer,
  type GameProgress,
} from './gameLogic'

const question = (n: number) => ({ prompt: `Question ${n}?`, options: ['A', 'B', 'C'], correctIndex: n % 3 })
const fiveQuestions = () => [1, 2, 3, 4, 5].map(question)
const sequence = (values: number[]) => { let index = 0; return () => values[index++ % values.length] as number }

describe('game codes', () => {
  it('builds a 6-character code from the unambiguous alphabet', () => {
    const code = generateGameCode(max => max - 1)
    expect(code).toBe('222222'.replace(/2/g, '9'))
    expect(generateGameCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })
  it('normalizes typed codes and rejects bad ones', () => {
    expect(normalizeGameCode(' ab-c 234 ')).toBe('ABC234')
    expect(() => normalizeGameCode('ABC')).toThrow(GameInputError)
    expect(() => normalizeGameCode('ABCDE0')).toThrow(GameInputError)
    expect(() => normalizeGameCode(undefined)).toThrow(GameInputError)
  })
})

describe('display names', () => {
  it('trims, collapses whitespace and replaces control characters', () => {
    expect(cleanDisplayName('  Ana   Cruz ')).toBe('Ana Cruz')
    expect(cleanDisplayName('Ana\nCruz\t!')).toBe('Ana Cruz !')
  })
  it('rejects empty, blank, too long and non-string names', () => {
    expect(() => cleanDisplayName('')).toThrow(GameInputError)
    expect(() => cleanDisplayName('   ')).toThrow(GameInputError)
    expect(() => cleanDisplayName('x'.repeat(GAME_LIMITS.nameMax + 1))).toThrow(GameInputError)
    expect(() => cleanDisplayName(42)).toThrow(GameInputError)
    expect(cleanDisplayName('x'.repeat(GAME_LIMITS.nameMax))).toHaveLength(GAME_LIMITS.nameMax)
  })
  it('keeps markup as plain text (rendering is escaped by the UI)', () => {
    expect(cleanDisplayName('<b>Hi</b>')).toBe('<b>Hi</b>')
  })
})

describe('input parsing', () => {
  it('accepts only whole-number time limits inside the range', () => {
    expect(parseTimeLimit(20)).toBe(20)
    for (const bad of [9, 61, 20.5, '20', null, Number.NaN]) expect(() => parseTimeLimit(bad)).toThrow(GameInputError)
  })
  it('accepts only an option index that exists', () => {
    expect(parseOptionIndex(2, 3)).toBe(2)
    for (const bad of [-1, 3, 1.5, '1', undefined]) expect(() => parseOptionIndex(bad, 3)).toThrow(GameInputError)
  })
})

describe('parseGameQuestions', () => {
  it('accepts 5 to 20 valid multiple-choice questions and trims text', () => {
    const parsed = parseGameQuestions([{ prompt: ' Q1 ', options: [' A ', 'B'], correctIndex: 1 }, ...[2, 3, 4, 5].map(question)])
    expect(parsed).toHaveLength(5)
    expect(parsed[0]).toEqual({ prompt: 'Q1', options: ['A', 'B'], correctIndex: 1 })
  })
  it('rejects the wrong number of questions', () => {
    expect(() => parseGameQuestions([1, 2, 3, 4].map(question))).toThrow(GameInputError)
    expect(() => parseGameQuestions(Array.from({ length: 21 }, (_, i) => question(i)))).toThrow(GameInputError)
    expect(() => parseGameQuestions('nope')).toThrow(GameInputError)
  })
  it('rejects bad prompts, options and answer indexes', () => {
    const bad = (patch: Record<string, unknown>) => () => parseGameQuestions([{ ...question(1), ...patch }, ...[2, 3, 4, 5].map(question)])
    expect(bad({ prompt: '' })).toThrow(GameInputError)
    expect(bad({ prompt: 'x'.repeat(501) })).toThrow(GameInputError)
    expect(bad({ options: ['only one'] })).toThrow(GameInputError)
    expect(bad({ options: ['a', 'b', 'c', 'd', 'e'] })).toThrow(GameInputError)
    expect(bad({ options: ['a', 'A'] })).toThrow(GameInputError)
    expect(bad({ options: ['a', ''] })).toThrow(GameInputError)
    expect(bad({ correctIndex: 3 })).toThrow(GameInputError)
    expect(bad({ correctIndex: -1 })).toThrow(GameInputError)
    expect(bad({ correctIndex: 0.5 })).toThrow(GameInputError)
  })
})

describe('question sources', () => {
  const cards = Array.from({ length: 8 }, (_, i) => ({ front: `Front ${i}`, back: `Back ${i}` }))
  it('builds multiple-choice questions from a deck with the right answer included', () => {
    const questions = questionsFromDeck(cards, sequence([0.1, 0.7, 0.4, 0.9, 0.2]))
    expect(questions).toHaveLength(8)
    for (const q of questions) {
      const card = cards.find(item => item.front === q.prompt)!
      expect(q.options[q.correctIndex]).toBe(card.back)
      expect(new Set(q.options).size).toBe(q.options.length)
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.options.length).toBeLessThanOrEqual(4)
    }
  })
  it('caps a big deck at 20 questions and refuses a deck that is too small', () => {
    const big = Array.from({ length: 60 }, (_, i) => ({ front: `F${i}`, back: `B${i}` }))
    expect(questionsFromDeck(big)).toHaveLength(GAME_LIMITS.maxQuestions)
    expect(() => questionsFromDeck(cards.slice(0, 4))).toThrow(GameInputError)
  })
  it('skips cards that have no different answer to offer as a distractor', () => {
    const same = Array.from({ length: 6 }, (_, i) => ({ front: `F${i}`, back: 'Same' }))
    expect(() => questionsFromDeck(same)).toThrow(GameInputError)
  })
  it('uses only multiple-choice lesson questions and ignores written ones', () => {
    const mc = (n: number) => ({ id: `q${n}`, kind: 'multiple-choice', prompt: `P${n}`, answer: 'A', options: ['A', 'B'], correctIndex: 0, explanation: '' })
    const written = { id: 'w', kind: 'written', prompt: 'W', answer: 'x', explanation: '' }
    const result = questionsFromLessonQuizzes([[mc(1), written, mc(2), mc(3)], [mc(4), mc(5), written]])
    expect(result.map(item => item.prompt)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
    expect(() => questionsFromLessonQuizzes([[mc(1), written]])).toThrow(GameInputError)
  })
})

describe('state transitions', () => {
  const lobby: GameProgress = { status: 'lobby', questionIndex: 0, questionCount: 2 }
  it('plays through lobby, question, reveal, question, reveal and finished', () => {
    const q1 = applyAction(lobby, 'start', 1)
    expect(q1).toEqual({ status: 'question', questionIndex: 0, questionCount: 2 })
    const r1 = applyAction(q1, 'reveal')
    expect(r1.status).toBe('reveal')
    const q2 = applyAction(r1, 'next')
    expect(q2).toEqual({ status: 'question', questionIndex: 1, questionCount: 2 })
    const r2 = applyAction(q2, 'reveal')
    expect(applyAction(r2, 'next').status).toBe('finished')
  })
  it('does not start twice or without players', () => {
    expect(() => applyAction(lobby, 'start', 0)).toThrow(GameInputError)
    expect(() => applyAction({ ...lobby, status: 'question' }, 'start', 3)).toThrow(GameInputError)
  })
  it('rejects illegal moves', () => {
    expect(() => applyAction(lobby, 'reveal')).toThrow(GameInputError)
    expect(() => applyAction(lobby, 'next')).toThrow(GameInputError)
    expect(() => applyAction({ ...lobby, status: 'question' }, 'next')).toThrow(GameInputError)
    expect(() => applyAction({ ...lobby, status: 'finished' }, 'end')).toThrow(GameInputError)
  })
  it('lets the host end a game from any unfinished state', () => {
    for (const status of ['lobby', 'question', 'reveal'] as const) expect(applyAction({ ...lobby, status }, 'end').status).toBe('finished')
  })
  it('maps the single advance button to reveal or next', () => {
    expect(actionForAdvance('question')).toBe('reveal')
    expect(actionForAdvance('reveal')).toBe('next')
    expect(() => actionForAdvance('lobby')).toThrow(GameInputError)
    expect(() => actionForAdvance('finished')).toThrow(GameInputError)
  })
})

describe('answer window and scoring', () => {
  const open = { status: 'question' as const, currentIndex: 2, submittedIndex: 2, nowMs: 10_000, endsAtMs: 20_000 }
  it('accepts an answer for the open question before the deadline', () => {
    expect(() => checkAnswerWindow(open)).not.toThrow()
  })
  it('accepts a slightly late answer inside the network grace but not after it', () => {
    expect(() => checkAnswerWindow({ ...open, nowMs: 20_000 + GAME_LIMITS.lateGraceMs })).not.toThrow()
    expect(() => checkAnswerWindow({ ...open, nowMs: 20_000 + GAME_LIMITS.lateGraceMs + 1 })).toThrow(GameInputError)
  })
  it('rejects answers for another question, a closed question or a missing deadline', () => {
    expect(() => checkAnswerWindow({ ...open, submittedIndex: 1 })).toThrow(GameInputError)
    expect(() => checkAnswerWindow({ ...open, status: 'reveal' })).toThrow(GameInputError)
    expect(() => checkAnswerWindow({ ...open, endsAtMs: null })).toThrow(GameInputError)
  })
  const base = { correct: true, startedAtMs: 0, endsAtMs: 20_000 }
  it('gives 1500 for an instant answer, 1250 halfway and 1000 at the deadline', () => {
    expect(scoreAnswer({ ...base, answeredAtMs: 0 })).toBe(1500)
    expect(scoreAnswer({ ...base, answeredAtMs: 10_000 })).toBe(1250)
    expect(scoreAnswer({ ...base, answeredAtMs: 20_000 })).toBe(1000)
  })
  it('gives only the base points inside the grace period and nothing after it', () => {
    expect(scoreAnswer({ ...base, answeredAtMs: 20_500 })).toBe(1000)
    expect(scoreAnswer({ ...base, answeredAtMs: 20_000 + GAME_LIMITS.lateGraceMs + 1 })).toBe(0)
  })
  it('gives nothing for wrong answers, answers before the question started, or a broken window', () => {
    expect(scoreAnswer({ ...base, correct: false, answeredAtMs: 1 })).toBe(0)
    expect(scoreAnswer({ ...base, answeredAtMs: -5 })).toBe(0)
    expect(scoreAnswer({ correct: true, startedAtMs: 5, endsAtMs: 5, answeredAtMs: 5 })).toBe(0)
  })
  it('detects when everyone has answered', () => {
    expect(everyoneAnswered(3, 3)).toBe(true)
    expect(everyoneAnswered(3, 2)).toBe(false)
    expect(everyoneAnswered(0, 0)).toBe(false)
  })
})

describe('ranking', () => {
  it('ranks by score with shared ranks for ties and stable ordering', () => {
    const ranked = rankPlayers([
      { uid: 'c', displayName: 'Cy', score: 500 },
      { uid: 'a', displayName: 'Ana', score: 1500 },
      { uid: 'b', displayName: 'Ben', score: 500 },
      { uid: 'd', displayName: 'Dee', score: 0 },
    ])
    expect(ranked.map(item => [item.displayName, item.rank])).toEqual([['Ana', 1], ['Ben', 2], ['Cy', 2], ['Dee', 4]])
  })
  it('handles an empty player list', () => {
    expect(rankPlayers([])).toEqual([])
  })
})

describe('fixtures sanity', () => {
  it('builds valid sample questions', () => {
    expect(parseGameQuestions(fiveQuestions())).toHaveLength(5)
  })
})
