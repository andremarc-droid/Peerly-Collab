import { httpsCallable } from 'firebase/functions'
import { collection, doc, onSnapshot, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { functions } from '../../lib/firebase/functions'
import { parseCurrentQuestion, parseGame, parsePlayer, parseReveal, validateJoinInput } from './schemas'
import type { CreateGameInput, CurrentQuestion, Game, GamePlayer, RevealState } from './types'

const call = <I, O>(name: string, data: I) => httpsCallable<I, O>(functions, name)(data).then(result => result.data)
type Fail = (error: Error) => void

/** Callable errors already carry a short, human message from the server; anything else gets a safe default. */
export function describeGameError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  const message = (error as { message?: unknown } | null)?.message
  if (code === 'functions/unavailable' || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'You seem to be offline. Check your connection and try again.'
  if (typeof code === 'string' && code.startsWith('functions/') && code !== 'functions/internal' && typeof message === 'string' && message.length > 0) return message
  return 'Something went wrong. Please try again.'
}

export function createGame(input: CreateGameInput) {
  return call<CreateGameInput, { gameId: string; code: string }>('createGame', { ...input, groupId: input.groupId ?? undefined } as CreateGameInput)
}
export function joinGame(code: string, displayName: string) {
  const checked = validateJoinInput(code, displayName)
  if ('error' in checked) return Promise.reject(new Error(checked.error))
  return call<{ code: string; displayName: string }, { gameId: string }>('joinGame', checked)
}
export const startGame = (gameId: string) => call<{ gameId: string }, { success: true }>('startGame', { gameId })
export const submitAnswer = (gameId: string, questionIndex: number, optionIndex: number) => call<{ gameId: string; questionIndex: number; optionIndex: number }, { accepted: boolean; revealed: boolean }>('submitAnswer', { gameId, questionIndex, optionIndex })
export const advanceQuestion = (gameId: string) => call<{ gameId: string }, { status: string }>('advanceQuestion', { gameId })
export const syncGame = (gameId: string) => call<{ gameId: string }, { status: string }>('syncGame', { gameId })
export const endGame = (gameId: string) => call<{ gameId: string }, { success: true }>('endGame', { gameId })
export const kickPlayer = (gameId: string, playerUid: string) => call<{ gameId: string; playerUid: string }, { success: true }>('kickPlayer', { gameId, playerUid })
export const deleteGame = (gameId: string) => call<{ gameId: string }, { success: true }>('deleteGame', { gameId })
/** Used by account deletion: removes games this person hosts and takes them out of the game they play. */
export const cleanupGames = () => call<Record<string, never>, { success: true }>('cleanupGames', {})

function safely<T>(parse: () => T, onChange: (value: T) => void, onError: Fail) {
  try { onChange(parse()) } catch (cause) { onError(cause instanceof Error ? cause : new Error('Could not read the game.')) }
}

/** Each watcher returns its unsubscribe function. A missing document is reported as null. */
export function watchGame(gameId: string, onChange: (game: Game | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'games', gameId), snap => (snap.exists() ? safely(() => parseGame(snap.data(), snap.id), onChange, onError) : onChange(null)), onError)
}
export function watchCurrentQuestion(gameId: string, onChange: (question: CurrentQuestion | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'games', gameId, 'state', 'current'), snap => (snap.exists() ? safely(() => parseCurrentQuestion(snap.data()), onChange, onError) : onChange(null)), onError)
}
export function watchReveal(gameId: string, onChange: (reveal: RevealState | null) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'games', gameId, 'state', 'reveal'), snap => (snap.exists() ? safely(() => parseReveal(snap.data()), onChange, onError) : onChange(null)), onError)
}
export function watchPlayers(gameId: string, onChange: (players: GamePlayer[]) => void, onError: Fail, db: Firestore = firestore) {
  return onSnapshot(collection(db, 'games', gameId, 'players'), snap => safely(() => snap.docs.map(item => parsePlayer(item.data(), item.id)), onChange, onError), onError)
}
/** The game this person is playing in or hosting, so a refresh can take them back. */
export function watchMyGameId(kind: 'player' | 'host', uid: string, onChange: (gameId: string | null) => void, onError: Fail, db: Firestore = firestore) {
  const path = kind === 'player' ? 'gamePlayerSessions' : 'gameHosts'
  return onSnapshot(doc(db, path, uid), snap => { const id = snap.exists() ? snap.data().gameId : null; onChange(typeof id === 'string' ? id : null) }, onError)
}
