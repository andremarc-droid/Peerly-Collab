import { GameInputError, cleanDisplayName, normalizeGameCode, parseTimeLimit } from './gameLogic.js'

/**
 * Strict validation of callable payloads for live games. Unknown fields are rejected, never ignored.
 * No Firebase imports: everything here is unit-tested without an emulator.
 */

const ID = /^[A-Za-z0-9_-]{1,128}$/
const UID = /^[A-Za-z0-9:_-]{1,128}$/

export type GameSourceRequest = { kind: 'deck'; classId: string; deckId: string } | { kind: 'lesson'; planId: string }
export interface CreateGameRequest { source: GameSourceRequest; timeLimitSec: number; groupId: string | null }
export interface JoinGameRequest { code: string; displayName: string }
export interface SubmitAnswerRequest { gameId: string; questionIndex: number; optionIndex: number }

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GameInputError('The request is invalid.')
  const record = value as Record<string, unknown>
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new GameInputError('The request has unexpected fields.')
  for (const key of required) if (!(key in record)) throw new GameInputError('The request is missing required fields.')
  return record
}

function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new GameInputError(`${label} is invalid.`)
  return value
}

function wholeNumber(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new GameInputError(`${label} is invalid.`)
  return value
}

export function parseCreateGameRequest(data: unknown): CreateGameRequest {
  const record = exact(data, ['source', 'timeLimitSec'], ['groupId'])
  const rawSource = record.source
  if (typeof rawSource !== 'object' || rawSource === null || Array.isArray(rawSource)) throw new GameInputError('Choose a deck or a lesson plan.')
  const kind = (rawSource as Record<string, unknown>).kind
  let source: GameSourceRequest
  if (kind === 'deck') {
    const parsed = exact(rawSource, ['kind', 'classId', 'deckId'])
    source = { kind: 'deck', classId: id(parsed.classId, 'The deck class'), deckId: id(parsed.deckId, 'The deck') }
  } else if (kind === 'lesson') {
    const parsed = exact(rawSource, ['kind', 'planId'])
    source = { kind: 'lesson', planId: id(parsed.planId, 'The lesson plan') }
  } else throw new GameInputError('Choose a deck or a lesson plan.')
  const groupId = record.groupId === undefined || record.groupId === null ? null : id(record.groupId, 'The group')
  return { source, timeLimitSec: parseTimeLimit(record.timeLimitSec), groupId }
}

export function parseJoinRequest(data: unknown): JoinGameRequest {
  const record = exact(data, ['code', 'displayName'])
  return { code: normalizeGameCode(record.code), displayName: cleanDisplayName(record.displayName) }
}

export function parseGameIdRequest(data: unknown): { gameId: string } {
  return { gameId: id(exact(data, ['gameId']).gameId, 'The game') }
}

export function parseSubmitRequest(data: unknown): SubmitAnswerRequest {
  const record = exact(data, ['gameId', 'questionIndex', 'optionIndex'])
  return { gameId: id(record.gameId, 'The game'), questionIndex: wholeNumber(record.questionIndex, 0, 19, 'The question'), optionIndex: wholeNumber(record.optionIndex, 0, 3, 'The answer') }
}

export function parseKickRequest(data: unknown): { gameId: string; playerUid: string } {
  const record = exact(data, ['gameId', 'playerUid'])
  if (typeof record.playerUid !== 'string' || !UID.test(record.playerUid)) throw new GameInputError('Choose a valid player.')
  return { gameId: id(record.gameId, 'The game'), playerUid: record.playerUid }
}

export function parseEmptyRequest(data: unknown): void {
  if (data === undefined || data === null) return
  exact(data, [])
}

export function assertHost(game: { hostId?: unknown } | undefined, uid: string): void {
  if (!game || game.hostId !== uid) throw new GameInputError('Only the host can do this.', 'permission-denied')
}

export interface RateWindow { startedAtMs: number; count: number }

/** Fixed-window limiter: returns whether this attempt is allowed and the window to store next. */
export function consumeRateWindow(current: RateWindow | null, nowMs: number, limit: number, windowMs: number): { allowed: boolean; next: RateWindow } {
  if (!current || nowMs < current.startedAtMs || nowMs - current.startedAtMs >= windowMs) return { allowed: true, next: { startedAtMs: nowMs, count: 1 } }
  if (current.count >= limit) return { allowed: false, next: current }
  return { allowed: true, next: { startedAtMs: current.startedAtMs, count: current.count + 1 } }
}
