import { httpsCallable } from 'firebase/functions'
import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { functions } from '../../../lib/firebase/functions'
import { auth } from '../../../lib/firebase/auth'
import { Capacitor } from '@capacitor/core'
import { parseReveal, parseSession, parseTeam } from '../schemas/team'
import type { Team, TeamAnswer, TeamReveal, TeamSession } from '../types/team'

function getApiEndpoint(): string {
  const custom = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (custom) return `${custom}/api/groupQuizzes`
  if (Capacitor.isNativePlatform() || (typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || (window.location.hostname === 'localhost' && window.location.port === '')))) {
    return 'https://peerly-collab.vercel.app/api/groupQuizzes'
  }
  return '/api/groupQuizzes'
}

/**
 * Group quiz client. Every change goes through a Cloud Function (or Vercel Serverless Function), because waiting,
 * timers and "only the representative answers" are only real when a trusted server enforces them. The browser reads
 * teams, the current question and reveals.
 */

async function call<I, O>(name: string, data: I): Promise<O> {
  if (import.meta.env.MODE === 'test' || import.meta.env.VITE_USE_EMULATORS === 'true') {
    return httpsCallable<I, O>(functions, name)(data).then(result => result.data)
  }
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
  }
  let token = await auth.currentUser?.getIdToken()
  if (!token && auth.currentUser) {
    token = await auth.currentUser.getIdToken(true).catch(() => undefined)
  }
  if (!token) {
    console.warn(`[teamService: ${name}] No active auth token (currentUser: ${auth.currentUser?.uid || 'null'})`)
  }
  const response = await fetch(getApiEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: name, data }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = await response.json()
  } catch {
    const text = await response.text().catch(() => '')
    json = { error: text || `HTTP ${response.status} ${response.statusText}`, rawText: text }
  }
  if (!response.ok) {
    console.error(`[groupQuizzes API Error: ${name}]`, json)
    const errorMsg = (typeof json.details === 'string' && json.details) || (typeof json.error === 'string' && json.error) || (typeof json.message === 'string' && json.message) || 'Something went wrong.'
    const error = new Error(errorMsg)
    ;(error as { code?: string }).code = (typeof json.code === 'string' && json.code) || 'functions/internal'
    throw error
  }
  return json.result as O
}

type Fail = (error: Error) => void
type Ok = { ok: true }

/** Callable errors already carry a short human message; anything else gets a safe default. */
export function describeTeamError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  const message = (error as { message?: unknown } | null)?.message
  if (code === 'functions/unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'You seem to be offline. Check your connection and try again.'
  if (typeof code === 'string' && code.startsWith('functions/') && code !== 'functions/internal' && typeof message === 'string' && message.length > 0) return message
  return 'Something went wrong. Please try again.'
}

// ---- forming teams ----------------------------------------------------------------------------------------------
export const createTeam = (quizId: string, name: string, memberIds: string[], representativeId: string) =>
  call<{ quizId: string; name: string; memberIds: string[]; representativeId: string }, { teamId: string }>('createTeam', { quizId, name, memberIds, representativeId })
export const addTeamMember = (quizId: string, teamId: string, memberId: string) => call<{ quizId: string; teamId: string; memberId: string }, Ok>('addTeamMember', { quizId, teamId, memberId })
export const removeTeamMember = (quizId: string, teamId: string, memberId: string) => call<{ quizId: string; teamId: string; memberId: string }, { deleted: boolean }>('removeTeamMember', { quizId, teamId, memberId })
export const setRepresentative = (quizId: string, teamId: string, memberId: string) => call<{ quizId: string; teamId: string; memberId: string }, Ok>('setRepresentative', { quizId, teamId, memberId })
export const deleteTeam = (quizId: string, teamId: string) => call<{ quizId: string; teamId: string }, Ok>('deleteTeam', { quizId, teamId })
export const createSelfTeam = (quizId: string, name: string, studyGroupId?: string | null) =>
  call<{ quizId: string; name: string; studyGroupId?: string }, { teamId: string; code: string }>('createSelfTeam', { quizId, name, ...(studyGroupId ? { studyGroupId } : {}) })
export const joinTeam = (quizId: string, code: string) => call<{ quizId: string; code: string }, { teamId: string }>('joinTeam', { quizId, code })
export const leaveTeam = (quizId: string, teamId: string) => call<{ quizId: string; teamId: string }, { deleted: boolean }>('leaveTeam', { quizId, teamId })

// ---- playing ----------------------------------------------------------------------------------------------------
export const startTeamAttempt = (quizId: string, teamId: string, force = false) => call<{ quizId: string; teamId: string; force?: boolean }, Ok>('startTeamAttempt', { quizId, teamId, ...(force ? { force } : {}) })
export const submitTeamAnswer = (quizId: string, teamId: string, questionIndex: number, answer: TeamAnswer) =>
  call<{ quizId: string; teamId: string; questionIndex: number; answer: TeamAnswer }, Ok>('submitTeamAnswer', { quizId, teamId, questionIndex, answer })
export const lockTeamAnswer = (quizId: string, teamId: string, questionIndex: number, answer: TeamAnswer) =>
  call<{ quizId: string; teamId: string; questionIndex: number; answer: TeamAnswer }, Ok>('lockTeamAnswer', { quizId, teamId, questionIndex, answer })
/** Safe to call repeatedly: the server makes at most one legal move per call (close an expired question, mark ready, or go on). */
export const advanceTeam = (quizId: string, teamId: string, questionIndex: number) =>
  call<{ quizId: string; teamId: string; questionIndex: number }, { advanced: boolean; phase: string; currentIndex: number }>('advanceTeam', { quizId, teamId, questionIndex })
export const submitTeamAttempt = (quizId: string, teamId: string) =>
  call<{ quizId: string; teamId: string }, { alreadySubmitted: boolean; score: number | null; maxScore: number | null }>('submitTeamAttempt', { quizId, teamId })
/** Used by account deletion: takes this person off every team. If it fails, nothing else is deleted so they can retry. */
export const cleanupGroupQuizData = () => call<Record<string, never>, { removed: number }>('cleanupGroupQuizData', {})

// ---- live data --------------------------------------------------------------------------------------------------
function safely<T>(parse: () => T, onChange: (value: T) => void, onError: Fail) {
  try { onChange(parse()) } catch (cause) { onError(cause instanceof Error ? cause : new Error('Could not read the team.')) }
}

/** Each watcher returns its unsubscribe function. A missing document is reported as null. */
export function watchMyTeamId(uid: string, quizId: string, onChange: (teamId: string | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'users', uid, 'groupQuizTeams', quizId), snap => { const id = snap.exists() ? snap.data().teamId : null; onChange(typeof id === 'string' ? id : null) }, onError)
}
export function watchTeam(quizId: string, teamId: string, onChange: (team: Team | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'quizzes', quizId, 'teams', teamId), snap => (snap.exists() ? safely(() => parseTeam(snap.data(), snap.id), onChange, onError) : onChange(null)), onError)
}
export function watchTeamSession(quizId: string, teamId: string, onChange: (session: TeamSession | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'quizzes', quizId, 'teamSessions', teamId), snap => (snap.exists() ? safely(() => parseSession(snap.data()), onChange, onError) : onChange(null)), onError)
}
/** Reveals of questions that already closed, in question order. */
export function watchReveals(quizId: string, teamId: string, onChange: (reveals: TeamReveal[]) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(collection(db, 'quizzes', quizId, 'teamSessions', teamId, 'reveals'),
    snap => safely(() => snap.docs.map(item => parseReveal(item.data())).sort((a, b) => a.index - b.index), onChange, onError), onError)
}
/** Instructor view: every team of the quiz. */
export function watchQuizTeams(quizId: string, onChange: (teams: Team[]) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(collection(db, 'quizzes', quizId, 'teams'),
    snap => safely(() => snap.docs.map(item => parseTeam(item.data(), item.id)).sort((a, b) => a.name.localeCompare(b.name)), onChange, onError), onError)
}
