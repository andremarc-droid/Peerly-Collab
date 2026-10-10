import { Timestamp, getFirestore, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { GAME_LIMITS, GameInputError, questionsFromDeck, questionsFromLessonQuizzes, type GameQuestion } from './gameLogic.js'
import type { GameSourceRequest } from './gameRequests.js'
import { buildReveal, type PlayerAnswer } from './gameReveal.js'

/** Firestore access is lazy: initializeApp() runs in index.ts after this module has been imported. */
export const database = (): Firestore => getFirestore()

export const gameRef = (gameId: string) => database().doc(`games/${gameId}`)
export const hostSlotRef = (uid: string) => database().doc(`gameHosts/${uid}`)
export const sessionRef = (uid: string) => database().doc(`gamePlayerSessions/${uid}`)
export const codeRef = (code: string) => database().doc(`gameCodes/${code}`)
export const privateRef = (gameId: string, name: 'questions' | 'key' | 'kicked') => database().doc(`games/${gameId}/private/${name}`)
export const stateRef = (gameId: string, name: 'current' | 'reveal') => database().doc(`games/${gameId}/state/${name}`)
export const playersRef = (gameId: string) => database().collection(`games/${gameId}/players`)
export const answerRef = (gameId: string, uid: string, index: number) => database().doc(`games/${gameId}/answers/${uid}_${index}`)

export type GameDoc = FirebaseFirestore.DocumentData

/** Every callable treats an expired game as gone, because Firestore TTL deletion can lag by a day. */
export function assertLive(snapshot: FirebaseFirestore.DocumentSnapshot, nowMs: number, allowFinished = false): GameDoc {
  const data = snapshot.data()
  if (!snapshot.exists || !data) throw new GameInputError('This game was not found.', 'not-found')
  const expires = data.expiresAt as Timestamp | undefined
  if (expires && expires.toMillis() <= nowMs) throw new GameInputError('This game has expired.', 'failed-precondition')
  if (!allowFinished && data.status === 'finished') throw new GameInputError('This game has ended.', 'failed-precondition')
  return data
}

export async function loadQuestions(uid: string, source: GameSourceRequest): Promise<GameQuestion[]> {
  const db = database()
  if (source.kind === 'deck') {
    const deck = await db.doc(`classes/${source.classId}/flashcardDecks/${source.deckId}`).get()
    if (!deck.exists || deck.get('ownerId') !== uid) throw new GameInputError('Only your own decks can be played.', 'permission-denied')
    const cards = deck.get('cards')
    if (!Array.isArray(cards)) throw new GameInputError('This deck has no cards.', 'failed-precondition')
    return questionsFromDeck(cards.map(card => ({ front: card?.front, back: card?.back })))
  }
  const plan = await db.doc(`users/${uid}/lessonPlans/${source.planId}`).get()
  if (!plan.exists) throw new GameInputError('Lesson plan not found.', 'not-found')
  const order = plan.get('order')
  if (!Array.isArray(order) || order.length > 12) throw new GameInputError('This lesson plan cannot be played.', 'failed-precondition')
  const lessons = await Promise.all(order.map(id => typeof id === 'string' ? db.doc(`users/${uid}/lessonPlans/${source.planId}/lessons/${id}`).get() : null))
  const quizzes = lessons.flatMap(lesson => lesson && lesson.exists && Array.isArray(lesson.get('quiz')) ? [lesson.get('quiz') as unknown[]] : [])
  return questionsFromLessonQuizzes(quizzes)
}

export function currentQuestionDoc(index: number, question: { prompt: string; options: string[] }, startedAtMs: number, timeLimitSec: number) {
  return {
    questionIndex: index,
    prompt: question.prompt,
    options: question.options,
    startedAt: Timestamp.fromMillis(startedAtMs),
    endsAt: Timestamp.fromMillis(startedAtMs + timeLimitSec * 1000),
  }
}

export interface RevealInputs { correctIndex: number; answers: Map<string, PlayerAnswer> }

/** Reads everything a reveal needs. Must run before the transaction's first write. */
export async function readRevealInputs(tx: Transaction, gameId: string, index: number, playerIds: string[], extra?: { uid: string; answer: PlayerAnswer }): Promise<RevealInputs> {
  const key = await tx.get(privateRef(gameId, 'key'))
  const correct = key.get('correct')
  const correctIndex = Array.isArray(correct) ? correct[index] : undefined
  if (!Number.isInteger(correctIndex)) throw new GameInputError('This game is missing its answer key.', 'failed-precondition')
  const refs = playerIds.filter(id => id !== extra?.uid).map(id => answerRef(gameId, id, index))
  const snaps = refs.length ? await tx.getAll(...refs) : []
  const answers = new Map<string, PlayerAnswer>()
  for (const snap of snaps) {
    if (!snap.exists) continue
    const uid = snap.get('uid')
    const optionIndex = snap.get('optionIndex')
    const answeredAt = snap.get('answeredAt') as Timestamp | undefined
    if (typeof uid === 'string' && Number.isInteger(optionIndex) && answeredAt) answers.set(uid, { optionIndex, answeredAtMs: answeredAt.toMillis() })
  }
  if (extra) answers.set(extra.uid, extra.answer)
  return { correctIndex: correctIndex as number, answers }
}

/** Writes state/reveal, the new scores and the reveal status. Players must be the docs read in this transaction. */
export function writeReveal(tx: Transaction, gameId: string, game: GameDoc, players: FirebaseFirestore.QueryDocumentSnapshot[], inputs: RevealInputs): void {
  const startedAtMs = (game.questionStartedAt as Timestamp).toMillis()
  const endsAtMs = (game.questionEndsAt as Timestamp).toMillis()
  const result = buildReveal({ correctIndex: inputs.correctIndex, startedAtMs, endsAtMs, players: players.map(p => ({ uid: p.id, score: Number(p.get('score')) || 0 })), answers: inputs.answers })
  tx.set(stateRef(gameId, 'reveal'), { questionIndex: game.questionIndex, correctOptionIndex: inputs.correctIndex, perPlayerPoints: result.perPlayerPoints })
  for (const player of players) tx.update(player.ref, { score: result.scores[player.id] ?? 0 })
  tx.update(gameRef(gameId), { status: 'reveal' })
}

/** Finishing frees the host's slot and every player's resume pointer (a person in this game has no other game, because joining moves them). */
export function finishWrites(tx: Transaction, gameId: string, game: GameDoc, playerIds: string[]): void {
  tx.update(gameRef(gameId), { status: 'finished', questionEndsAt: null })
  tx.delete(stateRef(gameId, 'current'))
  tx.delete(hostSlotRef(game.hostId as string))
  for (const id of playerIds) tx.delete(sessionRef(id))
}

export type { DocumentReference }
export { GAME_LIMITS }
