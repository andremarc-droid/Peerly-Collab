import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const progressPath = 'users/learner/deckProgress/class~deck'
const attemptPath = 'users/learner/studyAttempts/attempt-a'
const progress = { version: 1, cards: { card: { ease: 2.5 } }, newDay: '2026-10-10', newCount: 1 }
const attempt = {
  deckKey: 'class~deck', createdAt: 20, startedAt: 10, durationSeconds: 0,
  timeLimitSeconds: null, score: 0, maxScore: 0, review: [],
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: 8180, rules } })
})
afterAll(async () => env?.cleanup())
beforeEach(async () => env.clearFirestore())

describe('study data rules', () => {
  it('allows the owner to write and read progress and attempts', async () => {
    const db = env.authenticatedContext('learner').firestore()
    await assertSucceeds(setDoc(doc(db, progressPath), progress))
    await assertSucceeds(getDoc(doc(db, progressPath)))
    await assertSucceeds(setDoc(doc(db, attemptPath), attempt))
    await assertSucceeds(getDoc(doc(db, attemptPath)))
  })

  it('denies another user from reading or writing the owner progress', async () => {
    const stranger = env.authenticatedContext('stranger').firestore()
    await assertFails(getDoc(doc(stranger, progressPath)))
    await assertFails(setDoc(doc(stranger, progressPath), progress))
  })

  it('denies another user from reading or writing the owner attempts', async () => {
    const stranger = env.authenticatedContext('stranger').firestore()
    await assertFails(getDoc(doc(stranger, attemptPath)))
    await assertFails(setDoc(doc(stranger, attemptPath), attempt))
  })

  it('denies unauthenticated reads and writes', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, progressPath)))
    await assertFails(setDoc(doc(db, progressPath), progress))
    await assertFails(setDoc(doc(db, attemptPath), attempt))
  })

  it('rejects extra keys and progress over the card cap', async () => {
    const db = env.authenticatedContext('learner').firestore()
    await assertFails(setDoc(doc(db, progressPath), { ...progress, unexpected: true }))
    const cards = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`card-${index}`, {}]))
    await assertFails(setDoc(doc(db, progressPath), { ...progress, cards }))
  })

  it('rejects new-card counts over 100 and malformed local day keys', async () => {
    const db = env.authenticatedContext('learner').firestore()
    await assertFails(setDoc(doc(db, progressPath), { ...progress, newCount: 101 }))
    await assertFails(setDoc(doc(db, progressPath), { ...progress, newDay: '10/10/2026' }))
  })

  it('rejects attempt review sizes that disagree with maxScore', async () => {
    const db = env.authenticatedContext('learner').firestore()
    await assertFails(setDoc(doc(db, attemptPath), { ...attempt, maxScore: 1, review: [] }))
  })

  it('rejects attempts with more than 50 review entries', async () => {
    const db = env.authenticatedContext('learner').firestore()
    const review = Array.from({ length: 51 }, () => ({}))
    await assertFails(setDoc(doc(db, attemptPath), { ...attempt, maxScore: 51, review }))
  })

  it('allows only the owner to delete progress and attempts', async () => {
    const owner = env.authenticatedContext('learner').firestore()
    const stranger = env.authenticatedContext('stranger').firestore()
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc(progressPath).set(progress)
      await context.firestore().doc(attemptPath).set(attempt)
    })
    await assertFails(deleteDoc(doc(stranger, progressPath)))
    await assertFails(deleteDoc(doc(stranger, attemptPath)))
    await assertSucceeds(deleteDoc(doc(owner, progressPath)))
    await assertSucceeds(deleteDoc(doc(owner, attemptPath)))
  })

  it('bounds practice-test duration values', async () => {
    const db = env.authenticatedContext('learner').firestore()
    await assertFails(setDoc(doc(db, attemptPath), { ...attempt, durationSeconds: -1 }))
    await assertFails(setDoc(doc(db, attemptPath), { ...attempt, timeLimitSeconds: 10801 }))
  })
})
