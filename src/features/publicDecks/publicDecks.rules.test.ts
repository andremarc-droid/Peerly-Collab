import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

function validPublicDeck(ownerId = 'alice', overrides: Record<string, unknown> = {}) {
  const now = new Date()
  return {
    id: 'deck-1',
    ownerId,
    authorDisplayName: 'Alice',
    title: 'Cell Biology',
    description: 'Fundamental concepts of the cell',
    tags: ['biology', 'science'],
    cardCount: 1,
    cards: [{ id: 'c1', front: 'Mitochondria', back: 'Powerhouse' }],
    savesCount: 0,
    publishedAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.skipIf(!hasEmulator)('publicDecks rules', () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: { host: '127.0.0.1', port: 8180, rules },
    })
  })

  afterAll(async () => {
    await environment?.cleanup()
  })

  beforeEach(async () => {
    await environment?.clearFirestore()
  })

  it('allows signed-in users to read public decks', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDecks/deck-1').set(validPublicDeck('alice'))
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertSucceeds(getDoc(doc(bob, 'publicDecks', 'deck-1')))
  })

  it('denies unauthenticated users from reading public decks', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDecks/deck-1').set(validPublicDeck('alice'))
    })

    const anon = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'publicDecks', 'deck-1')))
  })

  it('allows owner to publish valid public deck', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(alice, 'publicDecks', 'deck-1'), validPublicDeck('alice')))
  })

  it('denies non-owner from publishing someone elses deck', async () => {
    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(setDoc(doc(bob, 'publicDecks', 'deck-1'), validPublicDeck('alice')))
  })

  it('denies client from setting non-zero savesCount on creation', async () => {
    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(
      setDoc(doc(alice, 'publicDecks', 'deck-1'), validPublicDeck('alice', { savesCount: 5 })),
    )
  })

  it('denies client from mutating savesCount on update', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDecks/deck-1').set(validPublicDeck('alice'))
    })

    const alice = environment.authenticatedContext('alice').firestore()
    await assertFails(
      updateDoc(doc(alice, 'publicDecks', 'deck-1'), { savesCount: 1 }),
    )
  })

  it('allows owner to delete their public deck', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDecks/deck-1').set(validPublicDeck('alice'))
    })

    const alice = environment.authenticatedContext('alice').firestore()
    await assertSucceeds(deleteDoc(doc(alice, 'publicDecks', 'deck-1')))
  })

  it('denies non-owner from deleting someone elses public deck', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDecks/deck-1').set(validPublicDeck('alice'))
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(deleteDoc(doc(bob, 'publicDecks', 'deck-1')))
  })

  it('allows signed-in user to report a deck with valid fields', async () => {
    const bob = environment.authenticatedContext('bob').firestore()
    await assertSucceeds(
      setDoc(doc(bob, 'publicDeckReports', 'rep-1'), {
        deckId: 'deck-1',
        reportedBy: 'bob',
        reason: 'inappropriate',
        note: 'Violates terms',
        createdAt: new Date(),
      }),
    )
  })

  it('denies anonymous user from submitting a report', async () => {
    const anon = environment.unauthenticatedContext().firestore()
    await assertFails(
      setDoc(doc(anon, 'publicDeckReports', 'rep-1'), {
        deckId: 'deck-1',
        reportedBy: 'anon',
        reason: 'spam',
        createdAt: new Date(),
      }),
    )
  })

  it('denies regular users from reading reports', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDeckReports/rep-1').set({
        deckId: 'deck-1',
        reportedBy: 'bob',
        reason: 'spam',
      })
    })

    const bob = environment.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, 'publicDeckReports', 'rep-1')))
  })

  it('allows admin with custom claim to read reports', async () => {
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('publicDeckReports/rep-1').set({
        deckId: 'deck-1',
        reportedBy: 'bob',
        reason: 'spam',
      })
    })

    const admin = environment.authenticatedContext('admin-user', { admin: true }).firestore()
    await assertSucceeds(getDoc(doc(admin, 'publicDeckReports', 'rep-1')))
  })
})
