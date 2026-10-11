import type { GroupParticipation } from '../../quizzes/types'
import type { Team, TeamAnswer, TeamReveal, TeamSession } from '../../quizzes/types/team'

/**
 * Pure helpers for the student side of a group quiz (no Firebase, no React).
 * The server decides everything that matters (who may answer, when a question closes, scores). These only shape what the screen shows.
 */

export const MIN_MEMBERS_TO_START = 2
export const TEAM_CODE_LENGTH = 6
/** Same alphabet as the server: no 0/O/1/I/L so codes are easy to read out loud. */
export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Mirrors the server: a blank is three or more underscores, or [blank]. */
export function blankCountOf(prompt: string): number {
  return prompt.match(/_{3,}|\[blank\]/gi)?.length ?? 0
}

/** Splits a fill-in-the-blank prompt into text pieces; there is one blank between each pair of pieces. */
export function promptPieces(prompt: string): string[] {
  return prompt.split(/_{3,}|\[blank\]/gi)
}

export function normalizeCodeInput(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '')
}

export function isValidCode(value: string): boolean {
  const code = normalizeCodeInput(value)
  return code.length === TEAM_CODE_LENGTH && [...code].every(char => TEAM_CODE_ALPHABET.includes(char))
}

/** Shows a code as ABC-123 so it is easy to read aloud. */
export function formatCode(code: string): string {
  return code.length === TEAM_CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code
}

// ---- answers ----------------------------------------------------------------------------------------------------

export function emptyAnswer(question: { type: string; prompt: string }): TeamAnswer {
  return question.type === 'fill_blank' ? Array.from({ length: blankCountOf(question.prompt) }, () => '') : ''
}

/** True when the answer is complete enough to send. The server validates again. */
export function isAnswerComplete(question: { type: string; prompt: string }, answer: TeamAnswer): boolean {
  if (question.type === 'fill_blank') {
    const blanks = blankCountOf(question.prompt)
    return blanks > 0 && Array.isArray(answer) && answer.length === blanks && answer.every(item => item.trim().length > 0)
  }
  return typeof answer === 'string' && answer.trim().length > 0
}

/** Turns an answer into readable text: option ids become their option text. */
export function answerText(question: { options: Array<{ id: string; text: string }> }, answer: TeamAnswer | null): string {
  if (answer === null) return 'No answer'
  if (Array.isArray(answer)) return answer.map(item => item.trim() || '(empty)').join(' · ')
  const option = question.options.find(item => item.id === answer)
  return option ? option.text : answer.trim() || '(empty)'
}

// ---- time -------------------------------------------------------------------------------------------------------

/**
 * Whole seconds left on the server deadline, or null when the question has no timer.
 * `nowMs` must already be corrected to the server clock (see estimateClockOffsetMs).
 */
export function secondsLeft(endsAtMs: number | null, nowMs: number): number | null {
  return endsAtMs === null ? null : Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/**
 * Best guess of (server clock - device clock). A question that opened a moment ago was stamped by the server just before the
 * snapshot arrived, so the difference is a fair sample. A snapshot that arrives long after the stamp (a refresh, a rejoin) says nothing about
 * the clock, so it returns null and the caller keeps its previous estimate. This only shapes the countdown; the server enforces the deadline.
 */
export function estimateClockOffsetMs(serverStampMs: number | null, receivedAtLocalMs: number, maxAgeMs = 4000): number | null {
  if (serverStampMs === null) return null
  const sample = serverStampMs - receivedAtLocalMs
  // A fresh stamp can only be slightly behind the device clock (network delay). Anything wildly different is a refresh, not a sample.
  return sample <= 500 && sample >= -maxAgeMs ? sample : null
}

/** The device says time is up. The server still has the last word, so the screen asks it to move on and trusts its answer. */
export function shouldAskServerToAdvance(session: Pick<TeamSession, 'phase' | 'locked' | 'questionEndsAt'>, nowMs: number): boolean {
  return session.phase === 'answering' && !session.locked && session.questionEndsAt !== null && nowMs >= session.questionEndsAt
}

// ---- who has answered -------------------------------------------------------------------------------------------

export interface MemberProgress { uid: string; name: string; answered: boolean; isRepresentative: boolean; isMe: boolean }

export function memberProgress(team: Pick<Team, 'memberIds' | 'memberNames' | 'representativeId'>, answered: Record<string, true>, myUid: string): MemberProgress[] {
  return team.memberIds.map(uid => ({ uid, name: team.memberNames[uid] || 'Student', answered: answered[uid] === true, isRepresentative: uid === team.representativeId, isMe: uid === myUid }))
}

export function answeredCount(team: Pick<Team, 'memberIds'>, answered: Record<string, true>): number {
  return team.memberIds.filter(uid => answered[uid] === true).length
}

/** What the person on screen may do right now, derived from the quiz settings and the session. */
export interface PlayerRole {
  canAnswer: boolean
  canLock: boolean
  /** Why the person cannot answer, in plain words. Empty when they can. */
  reason: string
}

export function playerRole(input: { settings: Pick<GroupParticipation, 'answerMode' | 'waitForEveryone'>; team: Pick<Team, 'memberIds' | 'representativeId'>; session: Pick<TeamSession, 'phase' | 'locked' | 'answered'>; uid: string; timeUp: boolean }): PlayerRole {
  const { settings, team, session, uid, timeUp } = input
  const none = (reason: string): PlayerRole => ({ canAnswer: false, canLock: false, reason })
  if (!team.memberIds.includes(uid)) return none('You are not on this team.')
  if (session.phase !== 'answering' || session.locked) return none('This question is closed.')
  if (timeUp) return none('Time is up for this question.')
  if (settings.answerMode === 'representative') {
    return uid === team.representativeId ? { canAnswer: true, canLock: false, reason: '' } : none('Your representative answers for the team. You can follow along.')
  }
  const everyoneIn = team.memberIds.every(id => session.answered[id] === true)
  const iAnswered = session.answered[uid] === true
  const canLock = !settings.waitForEveryone || everyoneIn
  return { canAnswer: !iAnswered, canLock: iAnswered && canLock, reason: '' }
}

// ---- wording ----------------------------------------------------------------------------------------------------

/** Lobby and intro sentences that explain how this quiz runs. */
export function describeGroupRules(settings: GroupParticipation): string[] {
  const lines = [settings.answerMode === 'representative'
    ? 'One teammate, the representative, submits the answer for the whole team. Everyone else can follow along.'
    : 'Everyone answers each question, then any teammate locks in the final team answer. It can match a teammate or differ.']
  if (settings.questionTimeSec !== null) lines.push(`Each question has ${settings.questionTimeSec} seconds.${settings.waitForEveryone ? ' The team moves on when everyone is done or time runs out.' : ''}`)
  else if (settings.waitForEveryone) lines.push('The team waits for everyone before moving to the next question.')
  else lines.push('There is no timer and no waiting: the team goes at its own pace.')
  lines.push('You get one shared score for the whole team.')
  return lines
}

export function startHint(team: Pick<Team, 'memberIds' | 'status'>, groupSize: number): string {
  if (team.status === 'in_progress') return 'The team is playing now.'
  if (team.memberIds.length < MIN_MEMBERS_TO_START) return `Waiting for at least ${MIN_MEMBERS_TO_START} members. Share the team code with your teammates.`
  if (team.memberIds.length < groupSize) return `${team.memberIds.length} of ${groupSize} joined. You can start now or wait for the rest.`
  return 'Everyone is here. Ready when you are.'
}

export function scoreLabel(team: Pick<Team, 'score' | 'maxScore'>): string {
  return team.score === null || team.maxScore === null ? 'Score not shown' : `${team.score} / ${team.maxScore}`
}

export function revealOutcome(reveal: Pick<TeamReveal, 'result'>): { label: string; known: boolean; correct: boolean } {
  if (!reveal.result) return { label: 'Answer recorded', known: false, correct: false }
  return reveal.result.correct ? { label: 'Correct', known: true, correct: true } : { label: 'Not quite', known: true, correct: false }
}

/** Reveal for the question that just closed, if the review step is showing it. */
export function currentReveal(reveals: TeamReveal[], session: Pick<TeamSession, 'phase' | 'currentIndex'>): TeamReveal | null {
  return session.phase === 'review' ? (reveals.find(item => item.index === session.currentIndex) ?? null) : null
}
