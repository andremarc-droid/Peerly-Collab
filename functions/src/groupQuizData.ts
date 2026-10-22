import { getFirestore, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { GroupQuizError, parseGroupSettings, type Answer, type GroupSettings, type SessionPhase, type TeamStatus } from './groupQuizLogic.js'
import { consumeRateWindow, type RateWindow } from './groupQuizRequests.js'

/**
 * Minimal HttpsError replacement that works both on Cloud Functions (where firebase-functions
 * provides the real class) and on Vercel (where importing firebase-functions crashes because
 * its init code contacts Google's Cloud Run metadata server which doesn't exist on Vercel).
 * Matches the shape that index.ts and the Vercel API route expect.
 */
export class HttpsError extends Error {
  readonly code: string
  readonly httpErrorCode: { status: number }
  constructor(code: string, message: string) {
    super(message)
    this.name = 'HttpsError'
    this.code = code
    const statusMap: Record<string, number> = {
      'ok': 200, 'cancelled': 499, 'unknown': 500, 'invalid-argument': 400,
      'deadline-exceeded': 504, 'not-found': 404, 'already-exists': 409,
      'permission-denied': 403, 'resource-exhausted': 429, 'failed-precondition': 400,
       'aborted': 409, 'out-of-range': 400, 'unimplemented': 501, 'internal': 500,
      'unavailable': 503, 'data-loss': 500, 'unauthenticated': 401,
    }
    this.httpErrorCode = { status: statusMap[code] ?? 500 }
  }
}

/**
 * Shared helpers for the group quiz callables. The Firestore handle is created lazily: index.ts calls initializeApp() AFTER its
 * imports run, so calling getFirestore() at module load would throw.
 */
let cachedDb: Firestore | undefined
export function db(): Firestore {
  if (!cachedDb) cachedDb = getFirestore()
  return cachedDb
}

// ---- paths ------------------------------------------------------------------------------------------------------
export const quizRef = (quizId: string) => db().doc(`quizzes/${quizId}`)
export const teamsCollection = (quizId: string) => db().collection(`quizzes/${quizId}/teams`)
export const teamRef = (quizId: string, teamId: string) => db().doc(`quizzes/${quizId}/teams/${teamId}`)
export const sessionRef = (quizId: string, teamId: string) => db().doc(`quizzes/${quizId}/teamSessions/${teamId}`)
export const revealRef = (quizId: string, teamId: string, index: number) => db().doc(`quizzes/${quizId}/teamSessions/${teamId}/reveals/${index}`)
export const privateRef = (quizId: string, teamId: string) => db().doc(`quizzes/${quizId}/teamPrivate/${teamId}`)
export const codeRef = (quizId: string, code: string) => db().doc(`quizzes/${quizId}/teamCodes/${code}`)
export const metaRef = (quizId: string) => db().doc(`quizzes/${quizId}/teamMeta/summary`)
export const boardRef = (quizId: string, teamId: string) => db().doc(`quizzes/${quizId}/teamBoards/${teamId}`)
export const boardsCollection = (quizId: string) => db().collection(`quizzes/${quizId}/teamBoards`)
/** One document per student per quiz: which team they are on. Readable by that student only. */
export const membershipRef = (uid: string, quizId: string) => db().doc(`users/${uid}/groupQuizTeams/${quizId}`)
export const membershipsCollection = (uid: string) => db().collection(`users/${uid}/groupQuizTeams`)
export const enrollmentRef = (classId: string, uid: string) => db().doc(`enrollments/${classId}_${uid}`)
export const participantRef = (quizId: string, uid: string) => db().doc(`quizzes/${quizId}/participants/${uid}`)
export const studyGroupMemberRef = (groupId: string, uid: string) => db().doc(`groups/${groupId}/members/${uid}`)

// ---- callable plumbing ------------------------------------------------------------------------------------------
export function authedUid(call: CallableRequest<unknown>): string {
  if (!call.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to use group quizzes.')
  return call.auth.uid
}

/** Maps pure-logic errors to HttpsError and hides unexpected failures behind a generic message. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof HttpsError) throw error
    if (error instanceof GroupQuizError) throw new HttpsError(error.code, error.message)
    console.error('Group quiz callable failed.', error)
    throw new HttpsError('internal', 'Something went wrong. Please try again.')
  }
}

export const RATE = {
  teamChange: { limit: 30, windowMs: 10 * 60_000 },
  play: { limit: 120, windowMs: 60_000 },
  manage: { limit: 60, windowMs: 60_000 },
} as const

/** Per-user fixed window. Runs in its own transaction so rejected requests still count. */
export async function enforceRate(uid: string, action: string, rate: { limit: number; windowMs: number }): Promise<void> {
  const ref = db().doc(`groupQuizRateLimits/${uid}`)
  const allowed = await db().runTransaction(async tx => {
    const snap = await tx.get(ref)
    const raw = snap.get(`windows.${action}`) as { startedAtMs?: unknown; count?: unknown } | undefined
    const current: RateWindow | null = raw && typeof raw.startedAtMs === 'number' && typeof raw.count === 'number' ? { startedAtMs: raw.startedAtMs, count: raw.count } : null
    const result = consumeRateWindow(current, Date.now(), rate.limit, rate.windowMs)
    if (result.allowed) tx.set(ref, { windows: { [action]: result.next } }, { merge: true })
    return result.allowed
  })
  if (!allowed) throw new GroupQuizError('Too many requests. Please wait a moment and try again.', 'resource-exhausted')
}

// ---- document shapes --------------------------------------------------------------------------------------------
export interface QuizInfo {
  id: string
  ownerId: string
  classId: string
  title: string
  status: string
  mode: 'quiz' | 'canvas'
  boardKind?: 'prebuilt' | 'blank'
  settings: GroupSettings
  answerReveal: 'after_each' | 'after_submit' | 'never'
  attemptsAllowed: number | null
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

export function readQuiz(snap: DocumentSnapshot): QuizInfo {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('This quiz no longer exists.', 'not-found')
  if (data.mode !== 'quiz' && data.mode !== 'canvas') throw new GroupQuizError('This is not a group quiz.', 'failed-precondition')
  if (typeof data.ownerId !== 'string' || typeof data.classId !== 'string' || typeof data.settings !== 'object' || data.settings === null) throw new GroupQuizError('This quiz is not set up for teams.', 'failed-precondition')
  const settings = parseGroupSettings(data.settings.participation)
  const reveal = data.settings.answerReveal
  const attempts = data.settings.attemptsAllowed
  return {
    id: snap.id,
    ownerId: data.ownerId,
    classId: data.classId,
    title: typeof data.title === 'string' ? data.title : '',
    status: String(data.status),
    mode: data.mode === 'canvas' ? 'canvas' : 'quiz',
    ...(data.boardKind === 'blank' || data.boardKind === 'prebuilt' ? { boardKind: data.boardKind } : {}),
    settings,
    answerReveal: reveal === 'after_each' || reveal === 'never' ? reveal : 'after_submit',
    attemptsAllowed: typeof attempts === 'number' ? attempts : null,
    shuffleQuestions: data.settings.shuffleQuestions === true,
    shuffleOptions: data.settings.shuffleOptions === true,
  }
}

export interface TeamData {
  name: string
  memberIds: string[]
  memberNames: Record<string, string>
  representativeId: string
  code: string | null
  studyGroupId: string | null
  status: TeamStatus
  createdBy: string
}

export function readTeam(snap: DocumentSnapshot): TeamData {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('This team no longer exists.', 'not-found')
  if (!Array.isArray(data.memberIds) || typeof data.representativeId !== 'string' || typeof data.status !== 'string') throw new GroupQuizError('This team is damaged. Ask your instructor to recreate it.', 'failed-precondition')
  return data as TeamData
}

export interface SessionQuestion {
  id: string
  index: number
  type: string
  prompt: string
  points: number
  options: Array<{ id: string; text: string }>
}

export interface SessionData {
  phase: SessionPhase
  currentIndex: number
  total: number
  questionStartedAt: number | null
  questionEndsAt: number | null
  reviewStartedAt: number | null
  question: SessionQuestion | null
  answered: Record<string, true>
  picks: Record<string, Answer> | null
  locked: boolean
  ready: Record<string, true>
}

export interface PrivateData {
  questionOrder: string[]
  optionOrder: Record<string, string[]>
  picks: Record<string, Record<string, Answer>>
  finalAnswers: Record<string, Answer>
  startedAtMs: number
}

export function readSession(snap: DocumentSnapshot): SessionData {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('This team has not started the quiz.', 'failed-precondition')
  return data as SessionData
}

export function readPrivate(snap: DocumentSnapshot): PrivateData {
  const data = snap.data()
  if (!snap.exists || !data) throw new GroupQuizError('This team has not started the quiz.', 'failed-precondition')
  return data as PrivateData
}

// ---- small shared checks ----------------------------------------------------------------------------------------
export function cleanDisplayName(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  const cleaned = Array.from(text).map(char => { const point = char.codePointAt(0) ?? 0; return point < 32 || (point >= 127 && point <= 159) ? ' ' : char }).join('').replace(/\s+/g, ' ').trim().slice(0, 60)
  return cleaned || 'Student'
}

export async function displayNames(tx: Transaction, uids: readonly string[]): Promise<Record<string, string>> {
  const snaps = await Promise.all(uids.map(uid => tx.get(db().doc(`users/${uid}`))))
  return Object.fromEntries(uids.map((uid, index) => [uid, cleanDisplayName(snaps[index]?.get('name'))]))
}

export async function assertActiveStudents(tx: Transaction, classId: string, uids: readonly string[]): Promise<void> {
  const snaps = await Promise.all(uids.map(uid => tx.get(enrollmentRef(classId, uid))))
  if (snaps.some(snap => !snap.exists || snap.get('status') !== 'active')) throw new GroupQuizError('Everyone on a team must be an active student in this class.', 'failed-precondition')
}

export function assertOwner(quiz: QuizInfo, uid: string): void {
  if (quiz.ownerId !== uid) throw new GroupQuizError('Only the quiz owner can do this.', 'permission-denied')
}

export function assertMember(team: TeamData, uid: string): void {
  if (!team.memberIds.includes(uid)) throw new GroupQuizError('You are not on this team.', 'permission-denied')
}

export function assertPlayable(quiz: QuizInfo): void {
  if (quiz.status !== 'published') throw new GroupQuizError('This quiz is not open right now.', 'failed-precondition')
}

export type { DocumentReference }
