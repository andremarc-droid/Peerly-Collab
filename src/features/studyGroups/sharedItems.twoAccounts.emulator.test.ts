import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  copySharedItemToLibrary,
  subscribeGroupSharedItems,
  unshareItemFromGroup,
  updateSharedItem,
  cleanupMyStudyGroupsOnAccountDeletion,
} from './services'
import type { SharedGroupItem } from './types'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

describe.skipIf(!hasEmulator)('sharedItems two-account emulator tests', () => {
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

  it('Alice sees Bob shared canvas snapshot live and copies it to her library', async () => {
    const aliceDb = environment.authenticatedContext('alice').firestore() as unknown as Firestore
    const bobDb = environment.authenticatedContext('bob').firestore() as unknown as Firestore
    const now = serverTimestamp()
    const groupId = 'group-items-live-1'

    // Alice creates group
    const batch = writeBatch(aliceDb)
    batch.set(doc(aliceDb, 'studyGroups', groupId), {
      id: groupId,
      name: 'Biology Group',
      privacy: 'public',
      ownerId: 'alice',
      ownerDisplayName: 'Alice',
      inviteCode: 'BIO999',
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

    // Add Bob to group
    await environment.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyGroups', groupId, 'members', 'bob'), {
        uid: 'bob',
        displayName: 'Bob',
        role: 'member',
        joinedAt: new Date(),
      })
    })

    // Alice subscribes to shared items live
    let aliceReceivedItem: SharedGroupItem | null = null
    let resolveAlice: () => void
    const alicePromise = new Promise<void>((res) => {
      resolveAlice = res
    })

    const unsub = subscribeGroupSharedItems(
      groupId,
      'canvas',
      (items) => {
        const found = items.find((i) => i.title === 'Photosynthesis Graph')
        if (found) {
          aliceReceivedItem = found
          resolveAlice()
        }
      },
      () => {},
      50,
      aliceDb,
    )

    // Bob shares a canvas snapshot into the group
    await assertSucceeds(
      setDoc(doc(bobDb, 'studyGroups', groupId, 'sharedItems', 'item-canvas-live'), {
        id: 'item-canvas-live',
        kind: 'canvas',
        title: 'Photosynthesis Graph',
        summary: 'Light and dark reactions',
        sharedByUid: 'bob',
        sharedByName: 'Bob',
        sharedAt: now,
        version: 1,
        payload: {
          nodeCount: 2,
          edgeCount: 1,
          nodes: [
            { id: 'n1', type: 'text', text: 'Light reactions', x: 0, y: 0, width: 200, height: 100, color: 'none' },
            { id: 'n2', type: 'text', text: 'Calvin cycle', x: 250, y: 0, width: 200, height: 100, color: 'none' },
          ],
          edges: [{ id: 'e1', from: 'n1', to: 'n2', arrow: 'to' }],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      }),
    )

    // Alice receives Bob's shared canvas live
    await alicePromise
    unsub()

    expect(aliceReceivedItem).not.toBeNull()
    expect((aliceReceivedItem as any).title).toBe('Photosynthesis Graph')

    // Alice saves a copy to her own library
    let createdCopyId = ''
    await environment.withSecurityRulesDisabled(async (ctx) => {
      createdCopyId = await copySharedItemToLibrary(
        aliceReceivedItem!,
        'alice',
        ctx.firestore() as unknown as Firestore,
      )
    })

    expect(createdCopyId).toBeTruthy()
  })

  it('Bob updates his shared note snapshot and Alice removes it as group owner', async () => {
    const aliceDb = environment.authenticatedContext('alice').firestore() as unknown as Firestore
    const bobDb = environment.authenticatedContext('bob').firestore() as unknown as Firestore
    const now = serverTimestamp()
    const groupId = 'group-update-test'

    // Setup group with Alice (owner) and Bob (member)
    await environment.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'studyGroups', groupId), {
        id: groupId,
        name: 'Chemistry Notes',
        privacy: 'public',
        ownerId: 'alice',
        ownerDisplayName: 'Alice',
        inviteCode: 'CHEM01',
        memberCount: 2,
        maxMembers: 50,
        createdAt: now,
        updatedAt: now,
      })
      await setDoc(doc(db, 'studyGroups', groupId, 'members', 'alice'), {
        uid: 'alice',
        displayName: 'Alice',
        role: 'owner',
        joinedAt: new Date(),
      })
      await setDoc(doc(db, 'studyGroups', groupId, 'members', 'bob'), {
        uid: 'bob',
        displayName: 'Bob',
        role: 'member',
        joinedAt: new Date(),
      })
    })

    // Bob shares note
    await assertSucceeds(
      setDoc(doc(bobDb, 'studyGroups', groupId, 'sharedItems', 'note-item-1'), {
        id: 'note-item-1',
        kind: 'note',
        title: 'Acids and Bases V1',
        sharedByUid: 'bob',
        sharedByName: 'Bob',
        sharedAt: now,
        version: 1,
        payload: { text: 'pH scale notes' },
      }),
    )

    // Bob updates his shared note
    await assertSucceeds(
      updateSharedItem(
        groupId,
        'note-item-1',
        {
          kind: 'note',
          title: 'Acids and Bases V2',
          summary: 'Updated summary',
          payload: { text: 'Updated pH notes' },
        },
        { uid: 'bob', displayName: 'Bob' },
        bobDb,
      ),
    )

    const updatedSnap = await getDoc(doc(bobDb, 'studyGroups', groupId, 'sharedItems', 'note-item-1'))
    expect(updatedSnap.data()?.title).toBe('Acids and Bases V2')
    expect(updatedSnap.data()?.version).toBe(2)

    // Alice (owner) unshares/removes the item
    await assertSucceeds(
      unshareItemFromGroup(
        groupId,
        'note-item-1',
        'note',
        'Acids and Bases V2',
        { uid: 'alice', displayName: 'Alice' },
        aliceDb,
      ),
    )

    const afterDelete = await getDoc(doc(aliceDb, 'studyGroups', groupId, 'sharedItems', 'note-item-1'))
    expect(afterDelete.exists()).toBe(false)
  })

  it('cleans up user sharedItems when account is deleted', async () => {
    const adminDb = environment.authenticatedContext('charlie').firestore() as unknown as Firestore
    const groupId = 'group-account-cleanup'
    const now = serverTimestamp()

    await environment.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      await setDoc(doc(db, 'studyGroups', groupId), {
        id: groupId,
        name: 'Math Club',
        privacy: 'public',
        ownerId: 'alice',
        ownerDisplayName: 'Alice',
        inviteCode: 'MATH99',
        memberCount: 2,
        maxMembers: 50,
        createdAt: now,
        updatedAt: now,
      })
      await setDoc(doc(db, 'studyGroups', groupId, 'members', 'charlie'), {
        uid: 'charlie',
        displayName: 'Charlie',
        role: 'member',
        joinedAt: new Date(),
      })
      await setDoc(doc(db, 'studyGroups', groupId, 'sharedItems', 'charlie-item'), {
        id: 'charlie-item',
        kind: 'note',
        title: 'Charlie Calculus',
        sharedByUid: 'charlie',
        sharedByName: 'Charlie',
        sharedAt: now,
        version: 1,
        payload: { text: 'Derivatives' },
      })
    })

    // Charlie deletes account
    await cleanupMyStudyGroupsOnAccountDeletion('charlie', adminDb)

    // The shared item should be deleted
    await environment.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'studyGroups', groupId, 'sharedItems', 'charlie-item'))
      expect(snap.exists()).toBe(false)
    })
  })
})
