import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.skipIf(!hasEmulator)('Study groups two-account emulator tests', () => {
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

  it('verifies live onSnapshot: Bob receives Alice shared deck live without reloading', async () => {
    const aliceDb = environment.authenticatedContext('alice').firestore()
    const bobDb = environment.authenticatedContext('bob').firestore()
    const now = serverTimestamp()
    const groupId = 'group-live-1'

    // Alice creates group
    const batch = writeBatch(aliceDb)
    batch.set(doc(aliceDb, 'studyGroups', groupId), {
      id: groupId,
      name: 'Biology 101',
      description: 'Study group for bio',
      privacy: 'public',
      ownerId: 'alice',
      ownerDisplayName: 'Alice',
      inviteCode: 'BIO101',
      memberCount: 1,
      maxMembers: 50,
      createdAt: now,
      updatedAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroups', groupId, 'members', 'alice'), {
      uid: 'alice',
      displayName: 'Alice',
      role: 'owner',
      joinedAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroupCodes', 'BIO101'), {
      groupId,
      groupName: 'Biology 101',
      ownerId: 'alice',
      createdAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroups', groupId, 'activity', 'act-1'), {
      id: 'act-1',
      type: 'joined',
      actorUid: 'alice',
      actorName: 'Alice',
      details: 'created the group',
      createdAt: now,
    })
    await assertSucceeds(batch.commit())

    // Bob joins as member
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroups', groupId, 'members', 'bob'), {
        uid: 'bob',
        displayName: 'Bob',
        role: 'member',
        joinedAt: new Date(),
      })
    })

    // Bob subscribes to sharedDecks live
    const bobDecks: string[] = []
    let receivedLiveUpdate = false
    let resolveListener: () => void
    const listenerPromise = new Promise<void>((resolve) => {
      resolveListener = resolve
    })

    const unsubscribe = onSnapshot(
      query(collection(bobDb, 'studyGroups', groupId, 'sharedDecks'), orderBy('sharedAt', 'desc')),
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            bobDecks.push(change.doc.data().title)
            if (change.doc.data().title === 'Cell Biology Live') {
              receivedLiveUpdate = true
              resolveListener()
            }
          }
        })
      },
    )

    // Alice shares a deck while Bob is listening
    const deckBatch = writeBatch(aliceDb)
    deckBatch.set(doc(aliceDb, 'studyGroups', groupId, 'sharedDecks', 'deck-live'), {
      id: 'deck-live',
      deckId: 'deck-live',
      sourceClassId: 'alice',
      title: 'Cell Biology Live',
      description: 'Flashcards on cells',
      cardCount: 1,
      cards: [{ id: 'c1', front: 'Mitochondria', back: 'Powerhouse' }],
      sharedByUid: 'alice',
      sharedByName: 'Alice',
      sharedAt: now,
    })
    deckBatch.set(doc(aliceDb, 'studyGroups', groupId, 'activity', 'act-2'), {
      id: 'act-2',
      type: 'deck_shared',
      actorUid: 'alice',
      actorName: 'Alice',
      details: 'shared the deck "Cell Biology Live"',
      createdAt: now,
    })
    await assertSucceeds(deckBatch.commit())

    // Wait for Bob's live onSnapshot to fire without any getDocs / reload
    await listenerPromise
    unsubscribe()

    expect(receivedLiveUpdate).toBe(true)
    expect(bobDecks).toContain('Cell Biology Live')
  })

  it('denies non-members from reading shared decks in public and private groups', async () => {
    const aliceDb = environment.authenticatedContext('alice').firestore()
    const charlieDb = environment.authenticatedContext('charlie').firestore()
    const now = serverTimestamp()
    const groupId = 'group-pub-1'

    // Alice creates public group
    const batch = writeBatch(aliceDb)
    batch.set(doc(aliceDb, 'studyGroups', groupId), {
      id: groupId,
      name: 'Public Math',
      privacy: 'public',
      ownerId: 'alice',
      ownerDisplayName: 'Alice',
      inviteCode: 'MATH01',
      memberCount: 1,
      maxMembers: 50,
      createdAt: now,
      updatedAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroups', groupId, 'members', 'alice'), {
      uid: 'alice',
      displayName: 'Alice',
      role: 'owner',
      joinedAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroupCodes', 'MATH01'), {
      groupId,
      groupName: 'Public Math',
      ownerId: 'alice',
      createdAt: now,
    })
    await assertSucceeds(batch.commit())

    // Alice shares deck into the group
    await assertSucceeds(
      setDoc(doc(aliceDb, 'studyGroups', groupId, 'sharedDecks', 'deck-math'), {
        id: 'deck-math',
        deckId: 'deck-math',
        sourceClassId: 'alice',
        title: 'Calculus I',
        cardCount: 1,
        cards: [{ id: 'c1', front: 'd/dx x^2', back: '2x' }],
        sharedByUid: 'alice',
        sharedByName: 'Alice',
        sharedAt: now,
      }),
    )

    // Charlie is signed in, but NOT a member of group-pub-1
    // Charlie can read group metadata because it is public
    const groupSnap = await getDoc(doc(charlieDb, 'studyGroups', groupId))
    expect(groupSnap.exists()).toBe(true)

    // Charlie CANNOT read sharedDecks or members or activity
    await assertFails(getDocs(collection(charlieDb, 'studyGroups', groupId, 'sharedDecks')))
    await assertFails(getDocs(collection(charlieDb, 'studyGroups', groupId, 'members')))
    await assertFails(getDocs(collection(charlieDb, 'studyGroups', groupId, 'activity')))
  })

  it('revokes access immediately when a member is removed', async () => {
    const aliceDb = environment.authenticatedContext('alice').firestore()
    const bobDb = environment.authenticatedContext('bob').firestore()
    const now = serverTimestamp()
    const groupId = 'group-remove-1'

    // Alice creates group
    const batch = writeBatch(aliceDb)
    batch.set(doc(aliceDb, 'studyGroups', groupId), {
      id: groupId,
      name: 'Physics Lab',
      privacy: 'private',
      ownerId: 'alice',
      ownerDisplayName: 'Alice',
      inviteCode: 'PHYS01',
      memberCount: 1,
      maxMembers: 50,
      createdAt: now,
      updatedAt: now,
    })
    batch.set(doc(aliceDb, 'studyGroups', groupId, 'members', 'alice'), {
      uid: 'alice',
      displayName: 'Alice',
      role: 'owner',
      joinedAt: now,
    })
    await assertSucceeds(batch.commit())

    // Alice shares deck
    await assertSucceeds(
      setDoc(doc(aliceDb, 'studyGroups', groupId, 'sharedDecks', 'deck-phys'), {
        id: 'deck-phys',
        deckId: 'deck-phys',
        sourceClassId: 'alice',
        title: 'Kinematics',
        cardCount: 1,
        cards: [{ id: 'c1', front: 'F = ma', back: 'Newton second law' }],
        sharedByUid: 'alice',
        sharedByName: 'Alice',
        sharedAt: now,
      }),
    )

    // Add Bob to group
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroups', groupId, 'members', 'bob'), {
        uid: 'bob',
        displayName: 'Bob',
        role: 'member',
        joinedAt: new Date(),
      })
    })

    // While Bob is a member, he can read sharedDecks
    await assertSucceeds(getDocs(collection(bobDb, 'studyGroups', groupId, 'sharedDecks')))

    // Alice removes Bob from group
    await assertSucceeds(deleteDoc(doc(aliceDb, 'studyGroups', groupId, 'members', 'bob')))

    // Bob can NO LONGER read sharedDecks
    await assertFails(getDocs(collection(bobDb, 'studyGroups', groupId, 'sharedDecks')))
  })

  it('surfaces errors via onSnapshot onError callback when non-member listens', async () => {
    const charlieDb = environment.authenticatedContext('charlie').firestore()
    const now = serverTimestamp()
    const groupId = 'group-surface-err'

    // Create a group that Charlie does not belong to
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroups', groupId), {
        id: groupId,
        name: 'Private Group',
        privacy: 'private',
        ownerId: 'alice',
        ownerDisplayName: 'Alice',
        inviteCode: 'ERR001',
        memberCount: 1,
        maxMembers: 50,
        createdAt: now,
        updatedAt: now,
      })
    })

    let caughtError: any = null
    await new Promise<void>((resolve) => {
      const unsubscribe = onSnapshot(
        collection(charlieDb, 'studyGroups', groupId, 'sharedDecks'),
        () => {},
        (err) => {
          caughtError = err
          unsubscribe()
          resolve()
        },
      )
    })

    expect(caughtError).not.toBeNull()
    expect(caughtError.code).toMatch(/permission-denied/)
  })
})

