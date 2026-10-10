import { Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import {
  GAME_LIMITS, GameInputError, actionForAdvance, applyAction, checkAnswerWindow, everyoneAnswered, generateGameCode,
  parseOptionIndex, type GameProgress, type GameStatus,
} from './gameLogic.js'
import {
  assertHost, consumeRateWindow, parseCreateGameRequest, parseEmptyRequest, parseGameIdRequest, parseJoinRequest, parseKickRequest, parseSubmitRequest,
} from './gameRequests.js'
import {
  answerRef, assertLive, codeRef, currentQuestionDoc, database, finishWrites, gameRef, hostSlotRef, loadQuestions, playersRef, privateRef,
  readRevealInputs, sessionRef, stateRef, writeReveal, type GameDoc,
} from './gameData.js'

const JOIN_ATTEMPTS = 15
const JOIN_WINDOW_MS = 10 * 60 * 1000
const KICK_LIST_LIMIT = 50

type Handler<T> = (uid: string, data: unknown) => Promise<T>

/** Signs-in check plus mapping of validation errors to callable errors. Anonymous sessions are refused, like the rules. */
function guarded<T>(handler: Handler<T>) {
  return async (call: CallableRequest<unknown>): Promise<T> => {
    const uid = call.auth?.uid
    if (!uid || call.auth?.token?.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Sign in to play live games.')
    try {
      return await handler(uid, call.data)
    } catch (error) {
      if (error instanceof GameInputError) throw new HttpsError(error.code, error.message)
      if (error instanceof HttpsError) throw error
      logger.error('Live game request failed.', { error })
      throw new HttpsError('internal', 'Something went wrong. Please try again.')
    }
  }
}

const progressOf = (game: GameDoc): GameProgress => ({ status: game.status as GameStatus, questionIndex: game.questionIndex as number, questionCount: game.questionCount as number })
const endsAtOf = (game: GameDoc): number | null => (game.questionEndsAt as Timestamp | null)?.toMillis() ?? null

function questionAt(snapshot: FirebaseFirestore.DocumentSnapshot, index: number): { prompt: string; options: string[] } {
  const list = snapshot.get('questions')
  const item = Array.isArray(list) ? list[index] : undefined
  if (!item || typeof item.prompt !== 'string' || !Array.isArray(item.options)) throw new GameInputError('This game is missing its questions.', 'failed-precondition')
  return item
}

async function deleteAnswersFor(gameId: string, uid: string): Promise<void> {
  const answers = await database().collection(`games/${gameId}/answers`).where('uid', '==', uid).get()
  if (answers.empty) return
  const batch = database().batch()
  answers.docs.forEach(item => batch.delete(item.ref))
  await batch.commit()
}

async function removePlayer(gameId: string, uid: string): Promise<void> {
  await database().runTransaction(async tx => {
    const [game, player, all] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playersRef(gameId).doc(uid)), tx.get(playersRef(gameId))])
    if (!player.exists) return
    tx.delete(player.ref)
    if (game.exists) tx.update(game.ref, { playerCount: Math.max(0, all.size - 1) })
  })
  await deleteAnswersFor(gameId, uid)
  const session = await sessionRef(uid).get()
  if (session.exists && session.get('gameId') === gameId) await session.ref.delete()
}

async function deleteGameInternal(gameId: string, game: GameDoc): Promise<void> {
  const players = await playersRef(gameId).get()
  for (const player of players.docs) {
    const session = await sessionRef(player.id).get()
    if (session.exists && session.get('gameId') === gameId) await session.ref.delete()
  }
  if (typeof game.code === 'string') await codeRef(game.code).delete()
  const slot = await hostSlotRef(game.hostId as string).get()
  if (slot.exists && slot.get('gameId') === gameId) await slot.ref.delete()
  await database().recursiveDelete(gameRef(gameId))
}

async function consumeJoinAttempt(uid: string, nowMs: number): Promise<void> {
  const ref = database().doc(`gameRateLimits/${uid}`)
  const allowed = await database().runTransaction(async tx => {
    const snap = await tx.get(ref)
    const startedAtMs = snap.get('startedAtMs')
    const count = snap.get('count')
    const current = snap.exists && typeof startedAtMs === 'number' && typeof count === 'number' ? { startedAtMs, count } : null
    const result = consumeRateWindow(current, nowMs, JOIN_ATTEMPTS, JOIN_WINDOW_MS)
    if (result.allowed) tx.set(ref, result.next)
    return result.allowed
  })
  if (!allowed) throw new GameInputError('Too many tries. Wait a few minutes and try again.', 'resource-exhausted')
}

export const createGame = guarded(async (uid, data) => {
  const request = parseCreateGameRequest(data)
  if (request.groupId && !(await database().doc(`groups/${request.groupId}/members/${uid}`).get()).exists) throw new GameInputError('Only group members can host a game for this group.', 'permission-denied')
  const questions = await loadQuestions(uid, request.source)
  const ref = database().collection('games').doc()
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateGameCode()
    const now = Date.now()
    const outcome = await database().runTransaction(async tx => {
      const [slot, taken] = await Promise.all([tx.get(hostSlotRef(uid)), tx.get(codeRef(code))])
      const existingId = slot.get('gameId')
      if (slot.exists && typeof existingId === 'string') {
        const existing = await tx.get(gameRef(existingId))
        const expires = existing.get('expiresAt') as Timestamp | undefined
        if (existing.exists && existing.get('status') !== 'finished' && (!expires || expires.toMillis() > now)) throw new GameInputError('You already host a live game. End or delete it first.', 'failed-precondition')
      }
      if (taken.exists) return 'taken' as const
      const expiresAt = Timestamp.fromMillis(now + GAME_LIMITS.ttlMs)
      tx.create(ref, {
        hostId: uid, groupId: request.groupId, code, status: 'lobby', questionIndex: 0, questionCount: questions.length, questionStartedAt: null, questionEndsAt: null,
        settings: { timeLimitSec: request.timeLimitSec }, playerCount: 0, createdAt: Timestamp.fromMillis(now), expiresAt,
      })
      tx.create(privateRef(ref.id, 'questions'), { questions: questions.map(({ prompt, options }) => ({ prompt, options })) })
      tx.create(privateRef(ref.id, 'key'), { correct: questions.map(question => question.correctIndex) })
      tx.create(privateRef(ref.id, 'kicked'), { uids: [] })
      tx.create(codeRef(code), { gameId: ref.id, expiresAt })
      tx.set(hostSlotRef(uid), { gameId: ref.id })
      return 'ok' as const
    })
    if (outcome === 'ok') return { gameId: ref.id, code }
  }
  throw new GameInputError('Could not make a game code. Please try again.', 'failed-precondition')
})

export const joinGame = guarded(async (uid, data) => {
  const { code, displayName } = parseJoinRequest(data)
  const now = Date.now()
  await consumeJoinAttempt(uid, now)
  const lookup = await codeRef(code).get()
  const gameId = lookup.get('gameId')
  if (!lookup.exists || typeof gameId !== 'string') throw new GameInputError('No game was found with that code.', 'not-found')
  const playerRef = playersRef(gameId).doc(uid)
  // Read before the transaction overwrites it: a person is only ever in one game at a time.
  const previousGameId = (await sessionRef(uid).get()).get('gameId')
  await database().runTransaction(async tx => {
    const [snap, player, kicked, all] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playerRef), tx.get(privateRef(gameId, 'kicked')), tx.get(playersRef(gameId))])
    const game = assertLive(snap, now)
    if (game.hostId === uid) throw new GameInputError('You are hosting this game.', 'failed-precondition')
    if ((kicked.get('uids') as unknown[] | undefined)?.includes(uid)) throw new GameInputError('The host removed you from this game.', 'permission-denied')
    if (typeof game.groupId === 'string' && !(await tx.get(database().doc(`groups/${game.groupId}/members/${uid}`))).exists) throw new GameInputError('This game is only for members of its group.', 'permission-denied')
    if (player.exists) { tx.set(sessionRef(uid), { gameId }); return }
    if (game.status !== 'lobby') throw new GameInputError('This game has already started.', 'failed-precondition')
    if (all.size >= GAME_LIMITS.maxPlayers) throw new GameInputError('This game is full.', 'resource-exhausted')
    tx.create(playerRef, { displayName, score: 0, joinedAt: Timestamp.fromMillis(now), answeredIndex: null })
    tx.update(snap.ref, { playerCount: all.size + 1 })
    tx.set(sessionRef(uid), { gameId })
  })
  if (typeof previousGameId === 'string' && previousGameId !== gameId) await removePlayer(previousGameId, uid).catch(() => undefined)
  return { gameId }
})

export const startGame = guarded(async (uid, data) => {
  const { gameId } = parseGameIdRequest(data)
  const now = Date.now()
  await database().runTransaction(async tx => {
    const [snap, players, questions] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playersRef(gameId)), tx.get(privateRef(gameId, 'questions'))])
    const game = assertLive(snap, now)
    assertHost(game, uid)
    const next = applyAction(progressOf(game), 'start', players.size)
    const limit = (game.settings as { timeLimitSec: number }).timeLimitSec
    tx.update(snap.ref, { status: next.status, questionIndex: 0, playerCount: players.size, questionStartedAt: Timestamp.fromMillis(now), questionEndsAt: Timestamp.fromMillis(now + limit * 1000) })
    tx.set(stateRef(gameId, 'current'), currentQuestionDoc(0, questionAt(questions, 0), now, limit))
  })
  return { success: true }
})

export const advanceQuestion = guarded(async (uid, data) => {
  const { gameId } = parseGameIdRequest(data)
  const now = Date.now()
  return database().runTransaction(async tx => {
    const [snap, players, questions] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playersRef(gameId)), tx.get(privateRef(gameId, 'questions'))])
    const game = assertLive(snap, now)
    assertHost(game, uid)
    const action = actionForAdvance(game.status as GameStatus)
    const next = applyAction(progressOf(game), action, players.size)
    if (action === 'reveal') {
      const inputs = await readRevealInputs(tx, gameId, game.questionIndex, players.docs.map(p => p.id))
      writeReveal(tx, gameId, game, players.docs, inputs)
      return { status: 'reveal' as GameStatus }
    }
    if (next.status === 'finished') { finishWrites(tx, gameId, game, players.docs.map(p => p.id)); return { status: 'finished' as GameStatus } }
    const limit = (game.settings as { timeLimitSec: number }).timeLimitSec
    tx.update(snap.ref, { status: 'question', questionIndex: next.questionIndex, playerCount: players.size, questionStartedAt: Timestamp.fromMillis(now), questionEndsAt: Timestamp.fromMillis(now + limit * 1000) })
    tx.set(stateRef(gameId, 'current'), currentQuestionDoc(next.questionIndex, questionAt(questions, next.questionIndex), now, limit))
    tx.delete(stateRef(gameId, 'reveal'))
    return { status: 'question' as GameStatus }
  })
})

/** Any participant may call this. It reveals only when the server deadline (plus grace) has passed or everyone answered. */
export const syncGame = guarded(async (uid, data) => {
  const { gameId } = parseGameIdRequest(data)
  const now = Date.now()
  return database().runTransaction(async tx => {
    const [snap, players] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playersRef(gameId))])
    const game = assertLive(snap, now, true)
    if (game.hostId !== uid && !players.docs.some(p => p.id === uid)) throw new GameInputError('Join this game first.', 'permission-denied')
    if (game.status !== 'question') return { status: game.status as GameStatus }
    const endsAt = endsAtOf(game)
    const timeUp = endsAt !== null && now >= endsAt + GAME_LIMITS.lateGraceMs
    const answered = players.docs.filter(p => p.get('answeredIndex') === game.questionIndex).length
    if (!timeUp && !everyoneAnswered(players.size, answered)) return { status: 'question' as GameStatus }
    const inputs = await readRevealInputs(tx, gameId, game.questionIndex, players.docs.map(p => p.id))
    writeReveal(tx, gameId, game, players.docs, inputs)
    return { status: 'reveal' as GameStatus }
  })
})

export const submitAnswer = guarded(async (uid, data) => {
  const request = parseSubmitRequest(data)
  const now = Date.now()
  return database().runTransaction(async tx => {
    const answer = answerRef(request.gameId, uid, request.questionIndex)
    const [snap, players, existing, current] = await Promise.all([tx.get(gameRef(request.gameId)), tx.get(playersRef(request.gameId)), tx.get(answer), tx.get(stateRef(request.gameId, 'current'))])
    const game = assertLive(snap, now)
    const self = players.docs.find(p => p.id === uid)
    if (!self) throw new GameInputError('Join this game first.', 'permission-denied')
    if (existing.exists) return { accepted: false, revealed: false }
    checkAnswerWindow({ status: game.status as GameStatus, currentIndex: game.questionIndex, submittedIndex: request.questionIndex, nowMs: now, endsAtMs: endsAtOf(game) })
    const options = current.get('options')
    parseOptionIndex(request.optionIndex, Array.isArray(options) ? options.length : 0)
    const answered = players.docs.filter(p => p.id !== uid && p.get('answeredIndex') === request.questionIndex).length + 1
    const everyone = everyoneAnswered(players.size, answered)
    const mine = { optionIndex: request.optionIndex, answeredAtMs: now }
    const inputs = everyone ? await readRevealInputs(tx, request.gameId, request.questionIndex, players.docs.map(p => p.id), { uid, answer: mine }) : null
    tx.create(answer, { uid, optionIndex: request.optionIndex, answeredAt: Timestamp.fromMillis(now) })
    tx.update(self.ref, { answeredIndex: request.questionIndex })
    if (inputs) writeReveal(tx, request.gameId, game, players.docs, inputs)
    return { accepted: true, revealed: inputs !== null }
  })
})

export const endGame = guarded(async (uid, data) => {
  const { gameId } = parseGameIdRequest(data)
  await database().runTransaction(async tx => {
    const [snap, players] = await Promise.all([tx.get(gameRef(gameId)), tx.get(playersRef(gameId))])
    const game = assertLive(snap, Date.now())
    assertHost(game, uid)
    applyAction(progressOf(game), 'end')
    finishWrites(tx, gameId, game, players.docs.map(p => p.id))
  })
  return { success: true }
})

export const kickPlayer = guarded(async (uid, data) => {
  const { gameId, playerUid } = parseKickRequest(data)
  if (playerUid === uid) throw new GameInputError('You cannot remove yourself.')
  await database().runTransaction(async tx => {
    const [snap, kicked, all, player] = await Promise.all([tx.get(gameRef(gameId)), tx.get(privateRef(gameId, 'kicked')), tx.get(playersRef(gameId)), tx.get(playersRef(gameId).doc(playerUid))])
    const game = assertLive(snap, Date.now())
    assertHost(game, uid)
    const list = ((kicked.get('uids') as string[] | undefined) ?? []).filter(item => typeof item === 'string')
    if (!list.includes(playerUid)) {
      if (list.length >= KICK_LIST_LIMIT) throw new GameInputError('This game has removed too many players.', 'resource-exhausted')
      tx.set(privateRef(gameId, 'kicked'), { uids: [...list, playerUid] })
    }
    if (player.exists) {
      tx.delete(player.ref)
      tx.update(snap.ref, { playerCount: Math.max(0, all.size - 1) })
    }
  })
  await deleteAnswersFor(gameId, playerUid)
  const session = await sessionRef(playerUid).get()
  if (session.exists && session.get('gameId') === gameId) await session.ref.delete()
  return { success: true }
})

export const deleteGame = guarded(async (uid, data) => {
  const { gameId } = parseGameIdRequest(data)
  const snap = await gameRef(gameId).get()
  if (!snap.exists) return { success: true }
  const game = snap.data() as GameDoc
  assertHost(game, uid)
  await deleteGameInternal(gameId, game)
  return { success: true }
})

/** Called before account deletion: deletes games this person hosts and removes them from the game they play in. */
export const cleanupGames = guarded(async (uid, data) => {
  parseEmptyRequest(data)
  for (let round = 0; round < 5; round += 1) {
    const owned = await database().collection('games').where('hostId', '==', uid).limit(20).get()
    if (owned.empty) break
    for (const item of owned.docs) await deleteGameInternal(item.id, item.data())
  }
  await hostSlotRef(uid).delete()
  const session = await sessionRef(uid).get()
  const gameId = session.get('gameId')
  if (session.exists && typeof gameId === 'string') await removePlayer(gameId, uid)
  await sessionRef(uid).delete()
  await database().doc(`gameRateLimits/${uid}`).delete()
  return { success: true }
})
