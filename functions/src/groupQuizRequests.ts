import { GROUP_LIMITS, GroupQuizError, cleanTeamName, normalizeTeamCode } from './groupQuizLogic.js'

/** Strict validation of every group quiz callable payload. Unknown fields are rejected, never ignored. */

const ID = /^[A-Za-z0-9_-]{1,128}$/
const UID = /^[A-Za-z0-9:_-]{1,128}$/

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new GroupQuizError('The request is invalid.')
  const record = value as Record<string, unknown>
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new GroupQuizError('The request has unexpected fields.')
  for (const key of required) if (!(key in record)) throw new GroupQuizError('The request is missing required fields.')
  return record
}
function id(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new GroupQuizError(`${label} is invalid.`)
  return value
}
function uid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UID.test(value)) throw new GroupQuizError(`${label} is invalid.`)
  return value
}
function questionIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 199) throw new GroupQuizError('The question is invalid.')
  return value
}

export const parseQuizRequest = (data: unknown) => ({ quizId: id(exact(data, ['quizId']).quizId, 'The quiz') })

export function parseTeamRef(data: unknown) {
  const r = exact(data, ['quizId', 'teamId'])
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team') }
}

export function parseCreateAssignedTeam(data: unknown) {
  const r = exact(data, ['quizId', 'name', 'memberIds', 'representativeId'])
  if (!Array.isArray(r.memberIds) || r.memberIds.length < 1 || r.memberIds.length > GROUP_LIMITS.maxTeamSize) throw new GroupQuizError(`Choose 1 to ${GROUP_LIMITS.maxTeamSize} members.`)
  const memberIds = r.memberIds.map(item => uid(item, 'A member'))
  if (new Set(memberIds).size !== memberIds.length) throw new GroupQuizError('A member is listed twice.')
  const representativeId = uid(r.representativeId, 'The representative')
  if (!memberIds.includes(representativeId)) throw new GroupQuizError('The representative must be a team member.')
  return { quizId: id(r.quizId, 'The quiz'), name: cleanTeamName(r.name), memberIds, representativeId }
}

export function parseCreateSelfTeam(data: unknown) {
  const r = exact(data, ['quizId', 'name'], ['studyGroupId'])
  return { quizId: id(r.quizId, 'The quiz'), name: cleanTeamName(r.name), studyGroupId: r.studyGroupId === undefined || r.studyGroupId === null ? null : id(r.studyGroupId, 'The study group') }
}

export function parseJoinTeam(data: unknown) {
  const r = exact(data, ['quizId', 'code'])
  return { quizId: id(r.quizId, 'The quiz'), code: normalizeTeamCode(r.code) }
}

export function parseSetRepresentative(data: unknown) {
  const r = exact(data, ['quizId', 'teamId', 'memberId'])
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team'), memberId: uid(r.memberId, 'The member') }
}

export function parseStartTeam(data: unknown) {
  const r = exact(data, ['quizId', 'teamId'], ['force'])
  if (r.force !== undefined && typeof r.force !== 'boolean') throw new GroupQuizError('The request is invalid.')
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team'), force: r.force === true }
}

/** `answer` is validated against the actual question later; here it only has to be a string or a short list of strings. */
export function parseAnswerRequest(data: unknown) {
  const r = exact(data, ['quizId', 'teamId', 'questionIndex', 'answer'])
  const answer = r.answer
  if (typeof answer !== 'string' && !(Array.isArray(answer) && answer.length <= 20 && answer.every(item => typeof item === 'string'))) throw new GroupQuizError('The answer is invalid.')
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team'), questionIndex: questionIndex(r.questionIndex), answer: answer as string | string[] }
}

export function parseQuestionStep(data: unknown) {
  const r = exact(data, ['quizId', 'teamId', 'questionIndex'])
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team'), questionIndex: questionIndex(r.questionIndex) }
}

export function parseRemoveMember(data: unknown) {
  const r = exact(data, ['quizId', 'teamId', 'memberId'])
  return { quizId: id(r.quizId, 'The quiz'), teamId: id(r.teamId, 'The team'), memberId: uid(r.memberId, 'The member') }
}

export function parseEmptyRequest(data: unknown): void {
  if (data === undefined || data === null) return
  exact(data, [])
}

export interface RateWindow { startedAtMs: number; count: number }

/** Fixed-window limiter: returns whether this attempt is allowed and the window to store next. */
export function consumeRateWindow(current: RateWindow | null, nowMs: number, limit: number, windowMs: number): { allowed: boolean; next: RateWindow } {
  if (!current || nowMs < current.startedAtMs || nowMs - current.startedAtMs >= windowMs) return { allowed: true, next: { startedAtMs: nowMs, count: 1 } }
  if (current.count >= limit) return { allowed: false, next: current }
  return { allowed: true, next: { startedAtMs: current.startedAtMs, count: current.count + 1 } }
}
