/**
 * Pure rules for group quizzes. No Firebase imports, so everything here is unit-tested without an emulator.
 * The Cloud Functions in groupQuizzes.ts call these and are the only code that writes team data.
 */

export const GROUP_LIMITS = {
  minTeamSize: 2,
  maxTeamSize: 10,
  minMembersToStart: 2,
  minQuestionTimeSec: 10,
  maxQuestionTimeSec: 300,
  maxTeamsPerQuiz: 100,
  teamNameMin: 1,
  teamNameMax: 40,
  codeLength: 6,
  /** Network grace added to every server deadline. */
  lateGraceMs: 1500,
  /** With a timer set, a stalled review step (someone never pressed Ready) moves on after this long. */
  reviewGraceMs: 15_000,
  maxAnswerLength: 500,
  maxBlankLength: 300,
} as const

export type GroupErrorCode = 'invalid-argument' | 'failed-precondition' | 'permission-denied' | 'not-found' | 'resource-exhausted' | 'already-exists'

export class GroupQuizError extends Error {
  code: GroupErrorCode
  constructor(message: string, code: GroupErrorCode = 'invalid-argument') {
    super(message)
    this.name = 'GroupQuizError'
    this.code = code
  }
}

export type AnswerMode = 'representative' | 'everyone'
export type TeamFormation = 'assigned' | 'self'
export type TeamStatus = 'forming' | 'ready' | 'in_progress' | 'submitted'
export type SessionPhase = 'answering' | 'review' | 'finished'
export type Answer = string | string[]

export interface GroupSettings {
  groupSize: number
  answerMode: AnswerMode
  teamFormation: TeamFormation
  waitForEveryone: boolean
  questionTimeSec: number | null
}

/** Reads the participation block of a quiz document. Older group documents only had groupSize, so everything else defaults. */
export function parseGroupSettings(participation: unknown): GroupSettings {
  if (typeof participation !== 'object' || participation === null || (participation as { type?: unknown }).type !== 'group') {
    throw new GroupQuizError('This quiz is not a group quiz.', 'failed-precondition')
  }
  const p = participation as Record<string, unknown>
  const groupSize = p.groupSize
  if (typeof groupSize !== 'number' || !Number.isInteger(groupSize) || groupSize < GROUP_LIMITS.minTeamSize || groupSize > GROUP_LIMITS.maxTeamSize) throw new GroupQuizError('This quiz has an invalid team size.', 'failed-precondition')
  const answerMode = p.answerMode === undefined ? 'representative' : p.answerMode
  const teamFormation = p.teamFormation === undefined ? 'assigned' : p.teamFormation
  if (answerMode !== 'representative' && answerMode !== 'everyone') throw new GroupQuizError('This quiz has an invalid answer mode.', 'failed-precondition')
  if (teamFormation !== 'assigned' && teamFormation !== 'self') throw new GroupQuizError('This quiz has an invalid team setting.', 'failed-precondition')
  const waitForEveryone = p.waitForEveryone === undefined ? false : p.waitForEveryone
  if (typeof waitForEveryone !== 'boolean') throw new GroupQuizError('This quiz has an invalid pacing setting.', 'failed-precondition')
  const time = p.questionTimeSec === undefined ? null : p.questionTimeSec
  if (time !== null && (typeof time !== 'number' || !Number.isInteger(time) || time < GROUP_LIMITS.minQuestionTimeSec || time > GROUP_LIMITS.maxQuestionTimeSec)) throw new GroupQuizError('This quiz has an invalid timer.', 'failed-precondition')
  return { groupSize, answerMode, teamFormation, waitForEveryone, questionTimeSec: time }
}

// ---- codes and names -------------------------------------------------------------------------------------------

export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateTeamCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < GROUP_LIMITS.codeLength; i += 1) code += TEAM_CODE_ALPHABET[Math.min(TEAM_CODE_ALPHABET.length - 1, Math.floor(random() * TEAM_CODE_ALPHABET.length))]
  return code
}

export function normalizeTeamCode(value: unknown): string {
  if (typeof value !== 'string') throw new GroupQuizError('Enter the 6-character team code.')
  const code = value.toUpperCase().replace(/[\s-]/g, '')
  if (!new RegExp(`^[${TEAM_CODE_ALPHABET}]{${GROUP_LIMITS.codeLength}}$`).test(code)) throw new GroupQuizError('Enter the 6-character team code.')
  return code
}

/** Team names are data, never markup. Control characters become spaces and whitespace collapses. */
export function cleanTeamName(value: unknown): string {
  if (typeof value !== 'string') throw new GroupQuizError('Enter a team name.')
  const cleaned = Array.from(value).map(char => { const point = char.codePointAt(0) ?? 0; return point < 32 || (point >= 127 && point <= 159) ? ' ' : char }).join('').replace(/\s+/g, ' ').trim()
  if (cleaned.length < GROUP_LIMITS.teamNameMin || cleaned.length > GROUP_LIMITS.teamNameMax) throw new GroupQuizError(`A team name needs ${GROUP_LIMITS.teamNameMin} to ${GROUP_LIMITS.teamNameMax} characters.`)
  return cleaned
}

// ---- team state -------------------------------------------------------------------------------------------------

const TRANSITIONS: Record<TeamStatus, readonly TeamStatus[]> = {
  forming: ['forming', 'ready'],
  ready: ['forming', 'ready', 'in_progress'],
  in_progress: ['in_progress', 'submitted'],
  submitted: [],
}

export function nextTeamStatus(from: TeamStatus, to: TeamStatus): TeamStatus {
  if (!TRANSITIONS[from].includes(to)) throw new GroupQuizError(`A team that is ${from.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.`, 'failed-precondition')
  return to
}

/** A team is "ready" once it has enough members to play; before that it is still forming. */
export function statusForMemberCount(memberCount: number): 'forming' | 'ready' {
  return memberCount >= GROUP_LIMITS.minMembersToStart ? 'ready' : 'forming'
}

export function assertCanStart(input: { memberCount: number; groupSize: number; status: TeamStatus; force: boolean }): void {
  if (input.status === 'in_progress' || input.status === 'submitted') throw new GroupQuizError('This team already started the quiz.', 'failed-precondition')
  if (input.memberCount > input.groupSize) throw new GroupQuizError('This team is larger than the quiz allows.', 'failed-precondition')
  if (input.memberCount < 1) throw new GroupQuizError('A team needs at least one member.', 'failed-precondition')
  if (input.memberCount < GROUP_LIMITS.minMembersToStart && !input.force) throw new GroupQuizError(`A team needs at least ${GROUP_LIMITS.minMembersToStart} members to start.`, 'failed-precondition')
}

export function assertCanJoin(input: { memberCount: number; groupSize: number; status: TeamStatus }): void {
  if (input.status === 'in_progress' || input.status === 'submitted') throw new GroupQuizError('This team already started the quiz.', 'failed-precondition')
  if (input.memberCount >= input.groupSize) throw new GroupQuizError('This team is full.', 'resource-exhausted')
}

export function withoutMember(memberIds: readonly string[], uid: string): string[] {
  return memberIds.filter(id => id !== uid)
}

/** When the representative leaves, the longest-standing remaining member takes over. Null means the team is empty. */
export function representativeAfterLeave(memberIds: readonly string[], representativeId: string, leavingId: string): string | null {
  const rest = withoutMember(memberIds, leavingId)
  if (rest.length === 0) return null
  return representativeId === leavingId ? rest[0]! : representativeId
}

// ---- pacing and authorization -----------------------------------------------------------------------------------

export function questionDeadline(startedAtMs: number, questionTimeSec: number | null): number | null {
  return questionTimeSec === null ? null : startedAtMs + questionTimeSec * 1000
}

export function isTimeUp(endsAtMs: number | null, nowMs: number, graceMs: number = GROUP_LIMITS.lateGraceMs): boolean {
  return endsAtMs !== null && nowMs >= endsAtMs + graceMs
}

export function assertCanSubmit(input: {
  answerMode: AnswerMode
  uid: string
  memberIds: readonly string[]
  representativeId: string
  phase: SessionPhase
  currentIndex: number
  questionIndex: number
  endsAtMs: number | null
  nowMs: number
}): void {
  if (!input.memberIds.includes(input.uid)) throw new GroupQuizError('You are not on this team.', 'permission-denied')
  if (input.phase !== 'answering') throw new GroupQuizError('This question is not open for answers.', 'failed-precondition')
  if (input.questionIndex !== input.currentIndex) throw new GroupQuizError('That question is no longer open.', 'failed-precondition')
  if (isTimeUp(input.endsAtMs, input.nowMs)) throw new GroupQuizError('Time is up for this question.', 'failed-precondition')
  if (input.answerMode === 'representative' && input.uid !== input.representativeId) throw new GroupQuizError('Only your team representative can answer.', 'permission-denied')
}

/** In everyone mode a member may lock the team's answer; with "wait for everyone" that needs all picks first, unless time ran out. */
export function canLockAnswer(input: { waitForEveryone: boolean; memberCount: number; pickCount: number; endsAtMs: number | null; nowMs: number }): boolean {
  if (!input.waitForEveryone) return true
  return input.pickCount >= input.memberCount || isTimeUp(input.endsAtMs, input.nowMs)
}

/** From the review step: free pace lets any member continue; waiting needs every member ready (a stalled step times out when a timer is set). */
export function canAdvanceReview(input: { waitForEveryone: boolean; memberCount: number; readyCount: number; reviewElapsedMs: number; hasTimer: boolean }): boolean {
  if (!input.waitForEveryone) return true
  if (input.readyCount >= input.memberCount) return true
  return input.hasTimer && input.reviewElapsedMs >= GROUP_LIMITS.reviewGraceMs
}

/** When time runs out in everyone mode with no locked answer, the most common pick becomes the answer; ties go to the earliest member. */
export function autoAnswer(picks: Readonly<Record<string, Answer>>, memberOrder: readonly string[]): Answer | null {
  const counts = new Map<string, { answer: Answer; count: number; first: number }>()
  memberOrder.forEach((uid, index) => {
    const answer = picks[uid]
    if (answer === undefined) return
    const key = JSON.stringify(answer)
    const found = counts.get(key)
    if (found) found.count += 1
    else counts.set(key, { answer, count: 1, first: index })
  })
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first)
  return ranked[0]?.answer ?? null
}

// ---- answers and question order ---------------------------------------------------------------------------------

export interface PlayableQuestion { type: string; prompt: string; options?: string[] }

export function blankCountOf(prompt: string): number {
  return prompt.match(/_{3,}|\[blank\]/gi)?.length ?? 0
}

/** Strictly validates a submitted answer against the question it is for. Anything else is rejected, never coerced. */
export function validateAnswer(question: PlayableQuestion, value: unknown): Answer {
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    if (typeof value !== 'string' || !(question.options ?? []).includes(value)) throw new GroupQuizError('Choose one of the listed answers.')
    return value
  }
  if (question.type === 'identification') {
    if (typeof value !== 'string' || value.trim().length < 1 || value.length > GROUP_LIMITS.maxAnswerLength) throw new GroupQuizError(`Type an answer of 1 to ${GROUP_LIMITS.maxAnswerLength} characters.`)
    return value
  }
  if (question.type === 'fill_blank') {
    const blanks = blankCountOf(question.prompt)
    if (!Array.isArray(value) || value.length !== blanks || blanks < 1 || !value.every(item => typeof item === 'string' && item.length <= GROUP_LIMITS.maxBlankLength)) throw new GroupQuizError(`Fill in all ${blanks} blanks.`)
    return value as string[]
  }
  throw new GroupQuizError('This kind of question cannot be answered as a team.', 'failed-precondition')
}

export function buildQuestionOrder<T>(items: readonly T[], shuffle: boolean, random: () => number = Math.random): T[] {
  const order = [...items]
  if (!shuffle) return order
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}
