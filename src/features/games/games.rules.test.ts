import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Written, NOT run here: needs the Firestore emulator (command in AGENTS.md).
let env: RulesTestEnvironment
const denied = { code: 'permission-denied' }
const game = (hostId: string) => ({ hostId, groupId: null, code: 'ABC234', status: 'question', questionIndex: 0, questionCount: 5, questionStartedAt: new Date(), questionEndsAt: new Date(), settings: { timeLimitSec: 20 }, playerCount: 1, createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) })

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('games/g1').set(game('host'))
    await db.doc('games/g2').set(game('otherHost'))
    await db.doc('games/g1/players/p1').set({ displayName: 'Ana', score: 0, joinedAt: new Date(), answeredIndex: null })
    await db.doc('games/g1/players/p2').set({ displayName: 'Ben', score: 0, joinedAt: new Date(), answeredIndex: 0 })
    await db.doc('games/g1/state/current').set({ questionIndex: 0, prompt: 'Q?', options: ['A', 'B'], startedAt: new Date(), endsAt: new Date() })
    await db.doc('games/g1/state/reveal').set({ questionIndex: 0, correctOptionIndex: 1, perPlayerPoints: { p1: 0, p2: 1500 } })
    await db.doc('games/g1/private/questions').set({ questions: [] })
    await db.doc('games/g1/private/key').set({ correct: [1] })
    await db.doc('games/g1/private/kicked').set({ uids: [] })
    await db.doc('games/g1/answers/p2_0').set({ uid: 'p2', optionIndex: 1, answeredAt: new Date() })
    await db.doc('gameCodes/ABC234').set({ gameId: 'g1', expiresAt: new Date() })
    await db.doc('gamePlayerSessions/p1').set({ gameId: 'g1' })
    await db.doc('gameHosts/host').set({ gameId: 'g1' })
  })
})

describe('live game rules', () => {
  it('denies signed-out users everywhere', async () => {
    const db = env.unauthenticatedContext().firestore()
    for (const path of ['games/g1', 'games/g1/players/p1', 'games/g1/state/current', 'gamePlayerSessions/p1', 'gameHosts/host']) {
      await expect(getDoc(doc(db, path))).rejects.toMatchObject(denied)
    }
  })

  it('lets the host and players read the game, the players and the open question', async () => {
    for (const uid of ['host', 'p1', 'p2']) {
      const db = env.authenticatedContext(uid).firestore()
      expect((await getDoc(doc(db, 'games/g1'))).exists()).toBe(true)
      expect((await getDocs(collection(db, 'games/g1/players'))).size).toBe(2)
      expect((await getDoc(doc(db, 'games/g1/state/current'))).exists()).toBe(true)
      expect((await getDoc(doc(db, 'games/g1/state/reveal'))).exists()).toBe(true)
    }
  })

  it('never lets a player or the host read private questions, the key, the kicked list or any answer', async () => {
    for (const uid of ['p1', 'host']) {
      const db = env.authenticatedContext(uid).firestore()
      for (const path of ['games/g1/private/questions', 'games/g1/private/key', 'games/g1/private/kicked', 'games/g1/answers/p2_0']) {
        await expect(getDoc(doc(db, path))).rejects.toMatchObject(denied)
      }
      await expect(getDocs(collection(db, 'games/g1/private'))).rejects.toMatchObject(denied)
      await expect(getDocs(collection(db, 'games/g1/answers'))).rejects.toMatchObject(denied)
    }
  })

  it('stops a player from reading another game and a non-player from reading players or state', async () => {
    const p1 = env.authenticatedContext('p1').firestore()
    await expect(getDoc(doc(p1, 'games/g2'))).rejects.toMatchObject(denied)
    await expect(getDocs(collection(p1, 'games/g2/players'))).rejects.toMatchObject(denied)
    const outsider = env.authenticatedContext('outsider').firestore()
    await expect(getDoc(doc(outsider, 'games/g1'))).rejects.toMatchObject(denied)
    await expect(getDocs(collection(outsider, 'games/g1/players'))).rejects.toMatchObject(denied)
    await expect(getDoc(doc(outsider, 'games/g1/state/current'))).rejects.toMatchObject(denied)
  })

  it('does not allow listing games, so games are found only by code through a callable', async () => {
    await expect(getDocs(collection(env.authenticatedContext('host').firestore(), 'games'))).rejects.toMatchObject(denied)
    await expect(getDoc(doc(env.authenticatedContext('p1').firestore(), 'gameCodes/ABC234'))).rejects.toMatchObject(denied)
  })

  it('blocks every client write, including scores, state and the host editing their own game', async () => {
    for (const uid of ['host', 'p1', 'outsider']) {
      const db = env.authenticatedContext(uid).firestore()
      await expect(setDoc(doc(db, 'games/new'), game(uid))).rejects.toMatchObject(denied)
      await expect(updateDoc(doc(db, 'games/g1'), { status: 'finished' })).rejects.toMatchObject(denied)
      await expect(deleteDoc(doc(db, 'games/g1'))).rejects.toMatchObject(denied)
      await expect(updateDoc(doc(db, 'games/g1/players/p1'), { score: 99999 })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, `games/g1/players/${uid}`), { displayName: 'Me', score: 0, joinedAt: new Date(), answeredIndex: null })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, 'games/g1/state/current'), { prompt: 'x' })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, 'games/g1/state/reveal'), { correctOptionIndex: 0 })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, 'games/g1/answers/x_0'), { uid, optionIndex: 0 })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, 'games/g1/private/key'), { correct: [0] })).rejects.toMatchObject(denied)
      await expect(setDoc(doc(db, `gamePlayerSessions/${uid}`), { gameId: 'g1' })).rejects.toMatchObject(denied)
    }
  })

  it('removes access when a player is kicked (their player document is deleted)', async () => {
    const p1 = env.authenticatedContext('p1').firestore()
    expect((await getDoc(doc(p1, 'games/g1'))).exists()).toBe(true)
    await env.withSecurityRulesDisabled(async context => { await context.firestore().doc('games/g1/players/p1').delete() })
    await expect(getDoc(doc(p1, 'games/g1'))).rejects.toMatchObject(denied)
    await expect(getDoc(doc(p1, 'games/g1/state/current'))).rejects.toMatchObject(denied)
    await expect(getDocs(collection(p1, 'games/g1/players'))).rejects.toMatchObject(denied)
  })

  it('lets people read only their own resume pointers', async () => {
    expect((await getDoc(doc(env.authenticatedContext('p1').firestore(), 'gamePlayerSessions/p1'))).exists()).toBe(true)
    expect((await getDoc(doc(env.authenticatedContext('host').firestore(), 'gameHosts/host'))).exists()).toBe(true)
    await expect(getDoc(doc(env.authenticatedContext('p2').firestore(), 'gamePlayerSessions/p1'))).rejects.toMatchObject(denied)
    await expect(getDoc(doc(env.authenticatedContext('p1').firestore(), 'gameHosts/host'))).rejects.toMatchObject(denied)
  })
})
