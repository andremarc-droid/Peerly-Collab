import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const firestorePort = Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180)
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: firestorePort, rules },
  })
}, 30_000)

afterAll(async () => environment.cleanup())

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    await db.doc('classes/class-a/learningCanvases/canvas-a').set({ ownerId: 'owner' })
    await db.doc('classes/class-a/flashcardDecks/deck-a').set({ ownerId: 'owner' })
    await db.doc('classes/class-a/graphViews/graph-a').set({ ownerId: 'owner' })
    await db.doc('sharedTutorThreads/thread-a').set({ ownerId: 'owner' })
    for (const [path, code] of [
      ['classes/class-a/learningCanvases/canvas-a/invites', 'AAAA2222'],
      ['classes/class-a/flashcardDecks/deck-a/invites', 'BBBB3333'],
      ['classes/class-a/graphViews/graph-a/invites', 'CCCC4444'],
      ['sharedTutorThreads/thread-a/invites', 'DDDD5555'],
    ]) {
      await db.doc(`${path}/${token}`).set({ createdBy: 'owner', code })
    }
  })
})

describe('Learning invite code security rules', () => {
  it('allows owners to register codes for each individually shared learning item', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const targets = [
      { code: 'AAAA2222', kind: 'canvas', classId: 'class-a', itemId: 'canvas-a', path: 'classes/class-a/learningCanvases/canvas-a/invites' },
      { code: 'BBBB3333', kind: 'flashcard', classId: 'class-a', itemId: 'deck-a', path: 'classes/class-a/flashcardDecks/deck-a/invites' },
      { code: 'CCCC4444', kind: 'graph', classId: 'class-a', itemId: 'graph-a', path: 'classes/class-a/graphViews/graph-a/invites' },
      { code: 'DDDD5555', kind: 'tutor', itemId: 'thread-a', path: 'sharedTutorThreads/thread-a/invites' },
    ]

    for (const target of targets) {
      await assertSucceeds(getDoc(doc(owner, `${target.path}/${token}`)))
      await assertSucceeds(setDoc(doc(owner, `learningInviteCodes/${target.code}`), {
        kind: target.kind,
        ...(target.classId ? { classId: target.classId } : {}),
        itemId: target.itemId,
        inviteToken: token,
        ownerId: 'owner',
        createdAt: serverTimestamp(),
        expiresAt: null,
      }))
    }
  })

  it('allows code lookup but prevents searching the code collection', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    await assertSucceeds(setDoc(doc(owner, 'learningInviteCodes/ABCD2345'), {
      kind: 'graph',
      classId: 'class-a',
      itemId: 'graph-a',
      inviteToken: token,
      ownerId: 'owner',
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    const recipient = environment.authenticatedContext('recipient').firestore()
    await assertSucceeds(getDoc(doc(recipient, 'learningInviteCodes/ABCD2345')))
    await assertFails(getDocs(collection(recipient, 'learningInviteCodes')))
  })

  it('rejects a code record that claims a different owner', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    await assertFails(setDoc(doc(owner, 'learningInviteCodes/ABCD2345'), {
      kind: 'graph',
      classId: 'class-a',
      itemId: 'graph-a',
      inviteToken: token,
      ownerId: 'attacker',
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
  })
})
