export type GameStatus = 'lobby' | 'question' | 'reveal' | 'finished'

export const GAME_LIMITS = {
  minQuestions: 5,
  maxQuestions: 20,
  minTimeSec: 10,
  maxTimeSec: 60,
  maxPlayers: 30,
  nameMax: 30,
  codeLength: 6,
} as const

export interface Game {
  id: string
  hostId: string
  groupId: string | null
  code: string
  status: GameStatus
  questionIndex: number
  questionCount: number
  questionStartedAtMs: number | null
  questionEndsAtMs: number | null
  timeLimitSec: number
  playerCount: number
  expiresAtMs: number
}

/** The open question only. It never carries the answer. */
export interface CurrentQuestion {
  questionIndex: number
  prompt: string
  options: string[]
  startedAtMs: number
  endsAtMs: number
}

export interface RevealState {
  questionIndex: number
  correctOptionIndex: number
  perPlayerPoints: Record<string, number>
}

export interface GamePlayer {
  uid: string
  displayName: string
  score: number
  /** The index of the last question this player answered. It is never the option they chose. */
  answeredIndex: number | null
}

export interface RankedGamePlayer extends GamePlayer { rank: number }

export type GameSourceChoice =
  | { kind: 'deck'; classId: string; deckId: string }
  | { kind: 'lesson'; planId: string }

export interface CreateGameInput {
  source: GameSourceChoice
  timeLimitSec: number
  groupId?: string | null
}
