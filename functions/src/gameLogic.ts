import { randomInt } from 'node:crypto'

/**
 * Pure rules for live quiz games. No Firebase imports: the callables in liveGames.ts wrap these
 * functions, and everything here is unit-tested without an emulator.
 */

export type GameStatus = 'lobby' | 'question' | 'reveal' | 'finished'
export type GameAction = 'start' | 'reveal' | 'next' | 'end'
export interface GameQuestion { prompt: string; options: string[]; correctIndex: number }
export interface GameProgress { status: GameStatus; questionIndex: number; questionCount: number }
export interface RankedPlayer { uid: string; displayName: string; score: number; rank: number }

export const GAME_LIMITS = {
  minQuestions: 5,
  maxQuestions: 20,
  minTimeSec: 10,
  maxTimeSec: 60,
  maxPlayers: 30,
  // Raise to 2 if live games should need at least two people.
  minPlayersToStart: 1,
  nameMax: 30,
  codeLength: 6,
  ttlMs: 6 * 60 * 60 * 1000,
  basePoints: 1000,
  maxSpeedBonus: 500,
  lateGraceMs: 750,
} as const

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export type GameErrorCode = 'invalid-argument' | 'failed-precondition' | 'permission-denied' | 'not-found' | 'resource-exhausted'

export class GameInputError extends Error {
  code: GameErrorCode
  constructor(message: string, code: GameErrorCode = 'invalid-argument') {
    super(message)
    this.name = 'GameInputError'
    this.code = code
  }
}

export function generateGameCode(pick: (max: number) => number = max => randomInt(max)): string {
  let code = ''
  for (let index = 0; index < GAME_LIMITS.codeLength; index += 1) code += CODE_ALPHABET[pick(CODE_ALPHABET.length)]
  return code
}

export function isValidGameCode(value: unknown): value is string {
  return typeof value === 'string' && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(value)
}

/** Accepts what people type: spaces and dashes are dropped and letters are upper-cased. */
export function normalizeGameCode(value: unknown): string {
  const code = typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : ''
  if (!isValidGameCode(code)) throw new GameInputError('Enter a valid 6-character game code.')
  return code
}

/** Display names are data: control characters become spaces, whitespace is collapsed and the length is capped. */
export function cleanDisplayName(value: unknown): string {
  if (typeof value !== 'string') throw new GameInputError('Enter a display name.')
  const spaced = Array.from(value).map(char => {
    const point = char.codePointAt(0) ?? 0
    return point < 32 || (point >= 127 && point <= 159) ? ' ' : char
  }).join('')
  const cleaned = spaced.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 1 || cleaned.length > GAME_LIMITS.nameMax) throw new GameInputError(`Display names must be 1 to ${GAME_LIMITS.nameMax} characters.`)
  return cleaned
}

export function parseTimeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < GAME_LIMITS.minTimeSec || value > GAME_LIMITS.maxTimeSec) {
    throw new GameInputError(`The time limit must be a whole number from ${GAME_LIMITS.minTimeSec} to ${GAME_LIMITS.maxTimeSec} seconds.`)
  }
  return value
}

export function parseOptionIndex(value: unknown, optionCount: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= optionCount) throw new GameInputError('That answer is not one of the options.')
  return value
}

export function parseGameQuestions(value: unknown): GameQuestion[] {
  if (!Array.isArray(value) || value.length < GAME_LIMITS.minQuestions || value.length > GAME_LIMITS.maxQuestions) {
    throw new GameInputError(`A game needs ${GAME_LIMITS.minQuestions} to ${GAME_LIMITS.maxQuestions} questions.`)
  }
  return value.map((item, index) => parseQuestion(item, `Question ${index + 1}`))
}

export function parseQuestion(item: unknown, label: string): GameQuestion {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new GameInputError(`${label} is invalid.`)
    const question = item as Record<string, unknown>
    const prompt = typeof question.prompt === 'string' ? question.prompt.trim() : ''
    if (prompt.length < 1 || prompt.length > 500) throw new GameInputError(`${label} needs a prompt of 1 to 500 characters.`)
    const options = question.options
    if (!Array.isArray(options) || options.length < 2 || options.length > 4 || !options.every(option => typeof option === 'string' && option.trim().length >= 1 && option.length <= 300)) {
      throw new GameInputError(`${label} needs 2 to 4 options of up to 300 characters.`)
    }
    const trimmed = (options as string[]).map(option => option.trim())
    if (new Set(trimmed.map(option => option.toLowerCase())).size !== trimmed.length) throw new GameInputError(`${label} has repeated options.`)
    const correctIndex = question.correctIndex
    if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= trimmed.length) throw new GameInputError(`${label} has an invalid correct answer.`)
    return { prompt, options: trimmed, correctIndex }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other] as T, copy[index] as T]
  }
  return copy
}

/** Builds multiple-choice questions from flashcards: the back is the answer and other cards' backs are distractors. */
export function questionsFromDeck(cards: ReadonlyArray<{ front: string; back: string }>, random: () => number = Math.random): GameQuestion[] {
  const usable = cards.filter(card => typeof card.front === 'string' && typeof card.back === 'string' && card.front.trim() && card.back.trim() && card.front.length <= 500 && card.back.length <= 300)
  const questions: GameQuestion[] = []
  for (const card of shuffle(usable, random)) {
    if (questions.length >= GAME_LIMITS.maxQuestions) break
    const answer = card.back.trim()
    const seen = new Set([answer.toLowerCase()])
    const distractors: string[] = []
    for (const other of shuffle(usable, random)) {
      const text = other.back.trim()
      if (seen.has(text.toLowerCase())) continue
      seen.add(text.toLowerCase())
      distractors.push(text)
      if (distractors.length === 3) break
    }
    if (distractors.length < 1) continue
    const options = shuffle([answer, ...distractors], random)
    questions.push({ prompt: card.front.trim(), options, correctIndex: options.indexOf(answer) })
  }
  if (questions.length < GAME_LIMITS.minQuestions) throw new GameInputError(`This deck makes only ${questions.length} usable questions. A game needs at least ${GAME_LIMITS.minQuestions}.`, 'failed-precondition')
  return questions
}

/** Uses only the multiple-choice questions of lesson quizzes (written answers cannot be played live). */
export function questionsFromLessonQuizzes(quizzes: ReadonlyArray<ReadonlyArray<unknown>>): GameQuestion[] {
  const questions: GameQuestion[] = []
  for (const quiz of quizzes) {
    for (const item of quiz) {
      const q = item as Record<string, unknown> | null
      if (!q || q.kind !== 'multiple-choice') continue
      try {
        questions.push(parseQuestion(q, 'Lesson question'))
      } catch {
        continue
      }
      if (questions.length >= GAME_LIMITS.maxQuestions) return questions
    }
  }
  if (questions.length < GAME_LIMITS.minQuestions) throw new GameInputError(`These lessons have only ${questions.length} multiple-choice questions. A game needs at least ${GAME_LIMITS.minQuestions}.`, 'failed-precondition')
  return questions
}

export function applyAction(game: GameProgress, action: GameAction, playerCount = 0): GameProgress {
  const wrong = (message: string) => new GameInputError(message, 'failed-precondition')
  switch (action) {
    case 'start':
      if (game.status !== 'lobby') throw wrong('This game has already started.')
      if (playerCount < GAME_LIMITS.minPlayersToStart) throw wrong('Wait for a player to join before starting.')
      return { ...game, status: 'question', questionIndex: 0 }
    case 'reveal':
      if (game.status !== 'question') throw wrong('There is no open question to reveal.')
      return { ...game, status: 'reveal' }
    case 'next': {
      if (game.status !== 'reveal') throw wrong('Reveal the answer before moving on.')
      const next = game.questionIndex + 1
      return next >= game.questionCount ? { ...game, status: 'finished' } : { ...game, status: 'question', questionIndex: next }
    }
    case 'end':
      if (game.status === 'finished') throw wrong('This game is already finished.')
      return { ...game, status: 'finished' }
  }
}

/** The host has one "advance" button: it reveals an open question, or moves on from a reveal. */
export function actionForAdvance(status: GameStatus): 'reveal' | 'next' {
  if (status === 'question') return 'reveal'
  if (status === 'reveal') return 'next'
  throw new GameInputError('The game cannot advance from here.', 'failed-precondition')
}

/** Answers are accepted only for the open question and only until the server deadline plus a small network grace. */
export function checkAnswerWindow(input: { status: GameStatus; currentIndex: number; submittedIndex: number; nowMs: number; endsAtMs: number | null }): void {
  if (input.status !== 'question') throw new GameInputError('This question is closed.', 'failed-precondition')
  if (input.submittedIndex !== input.currentIndex) throw new GameInputError('That question is no longer open.', 'failed-precondition')
  if (input.endsAtMs === null || input.nowMs > input.endsAtMs + GAME_LIMITS.lateGraceMs) throw new GameInputError('Time is up for this question.', 'failed-precondition')
}

/** 1000 for a correct answer plus up to 500 for speed. Wrong or too-late answers score nothing. */
export function scoreAnswer(input: { correct: boolean; answeredAtMs: number; startedAtMs: number; endsAtMs: number }): number {
  if (!input.correct) return 0
  const total = input.endsAtMs - input.startedAtMs
  if (total <= 0 || input.answeredAtMs < input.startedAtMs || input.answeredAtMs > input.endsAtMs + GAME_LIMITS.lateGraceMs) return 0
  const remaining = Math.min(Math.max(input.endsAtMs - input.answeredAtMs, 0), total)
  return GAME_LIMITS.basePoints + Math.round(GAME_LIMITS.maxSpeedBonus * (remaining / total))
}

export function everyoneAnswered(playerCount: number, answeredCount: number): boolean {
  return playerCount > 0 && answeredCount >= playerCount
}

/** Competition ranking: equal scores share a rank (1, 2, 2, 4). Ties are listed by name. */
export function rankPlayers(players: ReadonlyArray<{ uid: string; displayName: string; score: number }>): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName) || a.uid.localeCompare(b.uid))
  let previousScore: number | null = null
  let previousRank = 0
  return sorted.map((player, index) => {
    const rank = previousScore === player.score ? previousRank : index + 1
    previousScore = player.score
    previousRank = rank
    return { ...player, rank }
  })
}
