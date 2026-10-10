import { GAME_LIMITS, type CurrentQuestion, type Game, type GamePlayer, type GameStatus, type RankedGamePlayer, type RevealState } from './types'

/** Pure client-side parsing of the documents the UI reads. Stored data is untrusted: it is validated and rendered as text. */

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/
const STATUSES: readonly GameStatus[] = ['lobby', 'question', 'reveal', 'finished']

export class GameDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameDataError'
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GameDataError(`${label} is invalid.`)
  return value as Record<string, unknown>
}
function int(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new GameDataError(`${label} is invalid.`)
  return value
}
function text(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new GameDataError(`${label} is invalid.`)
  return value
}
/** Firestore timestamps expose toMillis(); plain numbers are accepted for tests and cached data. */
export function millisFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'object' && value !== null && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis()
  return null
}

export function parseGame(data: unknown, id: string): Game {
  const d = record(data, 'Game')
  const status = d.status
  if (!STATUSES.includes(status as GameStatus)) throw new GameDataError('Game status is invalid.')
  const settings = record(d.settings, 'Game settings')
  const expiresAtMs = millisFrom(d.expiresAt)
  if (expiresAtMs === null) throw new GameDataError('Game expiry is invalid.')
  return {
    id,
    hostId: text(d.hostId, 1, 128, 'Host'),
    groupId: d.groupId === null || d.groupId === undefined ? null : text(d.groupId, 1, 128, 'Group'),
    code: (() => { const code = text(d.code, 6, 6, 'Game code'); if (!CODE_PATTERN.test(code)) throw new GameDataError('Game code is invalid.'); return code })(),
    status: status as GameStatus,
    questionIndex: int(d.questionIndex, 0, GAME_LIMITS.maxQuestions, 'Question number'),
    questionCount: int(d.questionCount, GAME_LIMITS.minQuestions, GAME_LIMITS.maxQuestions, 'Question count'),
    questionStartedAtMs: millisFrom(d.questionStartedAt),
    questionEndsAtMs: millisFrom(d.questionEndsAt),
    timeLimitSec: int(settings.timeLimitSec, GAME_LIMITS.minTimeSec, GAME_LIMITS.maxTimeSec, 'Time limit'),
    playerCount: int(d.playerCount ?? 0, 0, GAME_LIMITS.maxPlayers, 'Player count'),
    expiresAtMs,
  }
}

export function parseCurrentQuestion(data: unknown): CurrentQuestion {
  const d = record(data, 'Question')
  const options = d.options
  if (!Array.isArray(options) || options.length < 2 || options.length > 4 || !options.every(option => typeof option === 'string' && option.length >= 1 && option.length <= 300)) throw new GameDataError('Question options are invalid.')
  const startedAtMs = millisFrom(d.startedAt)
  const endsAtMs = millisFrom(d.endsAt)
  if (startedAtMs === null || endsAtMs === null) throw new GameDataError('Question timing is invalid.')
  return { questionIndex: int(d.questionIndex, 0, GAME_LIMITS.maxQuestions - 1, 'Question number'), prompt: text(d.prompt, 1, 500, 'Question'), options: options as string[], startedAtMs, endsAtMs }
}

export function parseReveal(data: unknown): RevealState {
  const d = record(data, 'Reveal')
  const raw = record(d.perPlayerPoints, 'Points')
  const perPlayerPoints: Record<string, number> = {}
  for (const [uid, points] of Object.entries(raw)) perPlayerPoints[uid] = int(points, 0, 1500, 'Points')
  return { questionIndex: int(d.questionIndex, 0, GAME_LIMITS.maxQuestions - 1, 'Question number'), correctOptionIndex: int(d.correctOptionIndex, 0, 3, 'Correct answer'), perPlayerPoints }
}

export function parsePlayer(data: unknown, uid: string): GamePlayer {
  const d = record(data, 'Player')
  const answered = d.answeredIndex
  return {
    uid,
    displayName: text(d.displayName, 1, GAME_LIMITS.nameMax, 'Display name'),
    score: int(d.score, 0, 1_000_000, 'Score'),
    answeredIndex: answered === null || answered === undefined ? null : int(answered, 0, GAME_LIMITS.maxQuestions - 1, 'Answered question'),
  }
}

/** Mirrors the server: spaces and dashes are dropped and letters are upper-cased. */
export function normalizeGameCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '')
}

export function isValidGameCode(value: string): boolean {
  return CODE_PATTERN.test(value)
}

/** Mirrors the server: control characters become spaces, whitespace collapses, the length is capped. */
export function cleanDisplayName(value: string): string {
  return Array.from(value).map(char => { const point = char.codePointAt(0) ?? 0; return point < 32 || (point >= 127 && point <= 159) ? ' ' : char }).join('').replace(/\s+/g, ' ').trim()
}

export function validateJoinInput(code: string, displayName: string): { code: string; displayName: string } | { error: string } {
  const normalized = normalizeGameCode(code)
  if (!isValidGameCode(normalized)) return { error: 'Enter the 6-character game code.' }
  const name = cleanDisplayName(displayName)
  if (name.length < 1 || name.length > GAME_LIMITS.nameMax) return { error: `Enter a name of 1 to ${GAME_LIMITS.nameMax} characters.` }
  return { code: normalized, displayName: name }
}

/** Competition ranking: equal scores share a rank (1, 2, 2, 4). */
export function rankPlayers(players: ReadonlyArray<{ uid: string; displayName: string; score: number; answeredIndex: number | null }>): RankedGamePlayer[] {
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

/** Whole seconds left, never below zero. Uses the server's end time and a clock offset estimated by the caller. */
export function secondsLeft(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

export function answeredCount(players: ReadonlyArray<GamePlayer>, questionIndex: number): number {
  return players.filter(player => player.answeredIndex === questionIndex).length
}
