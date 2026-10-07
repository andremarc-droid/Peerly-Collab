import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const projectId = 'demo-peerly-collab'
const threadPath = 'sharedTutorThreads/thread-a'
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
    await context.firestore().doc(threadPath).set({
      ownerId: 'owner',
      title: 'Tutor conversation',
      summary: '',
      summarizedCount: 0,
      createdAtMs: 1,
      updatedAtMs: 1,
      createdAt: new Date(1),
      updatedAt: new Date(1),
    })
  })
})

async function inviteAndJoin(role: 'viewer' | 'editor', uid: string) {
  const owner = environment.authenticatedContext('owner').firestore()
  const member = environment.authenticatedContext(uid).firestore()
  await assertSucceeds(setDoc(doc(owner, `${threadPath}/invites/${token}`), {
    createdBy: 'owner',
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: null,
  }))
  await assertSucceeds(getDoc(doc(member, `${threadPath}/tutorMembers/${uid}`)))
  await assertSucceeds(setDoc(doc(member, `${threadPath}/tutorMembers/${uid}`), {
    uid,
    role,
    displayName: uid,
    invitedBy: 'owner',
    grantedByToken: token,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
  return { owner, member }
}

function tutorMessage(id: string, text = 'Explain this concept') {
  return {
    id,
    role: 'user',
    text,
    createdAtMs: Date.now(),
    createdAt: new Date(),
    images: [],
  }
}

describe('AI Tutor conversation sharing security rules', () => {
  it('lets owners discover their own shared conversations', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const conversations = await assertSucceeds(
      getDocs(query(collection(owner, 'sharedTutorThreads'), where('ownerId', '==', 'owner'))),
    )
    expect(conversations.docs.map((item) => item.id)).toContain('thread-a')
  })

  it('allows an owner to persist a thread explicitly for sharing', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    await assertSucceeds(setDoc(doc(owner, 'sharedTutorThreads/new-thread'), {
      ownerId: 'owner',
      title: 'Shared study chat',
      summary: '',
      summarizedCount: 0,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })

  it('keeps a shared conversation private from non-members', async () => {
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertFails(getDoc(doc(outsider, threadPath)))
  })

  it('lets an invited viewer read a conversation but not write messages', async () => {
    const { member } = await inviteAndJoin('viewer', 'viewer')
    await assertSucceeds(getDoc(doc(member, threadPath)))
    await assertSucceeds(setDoc(doc(member, `${threadPath}/activity/joined`), {
      actorId: 'viewer',
      actorName: 'Viewer',
      summary: 'Joined the conversation.',
      createdAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(member, `${threadPath}/activity/spam`), {
      actorId: 'viewer',
      actorName: 'Viewer',
      summary: 'Changed conversation contents.',
      createdAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(member, `${threadPath}/messages/viewer-message`), tutorMessage('viewer-message')))
  })

  it('allows shared conversation discovery through the member record', async () => {
    const { member } = await inviteAndJoin('editor', 'editor')
    await assertSucceeds(getDocs(query(collectionGroup(member, 'tutorMembers'), where('uid', '==', 'editor'))))
  })

  it('lets an invited editor append messages and presence', async () => {
    const { member } = await inviteAndJoin('editor', 'editor')
    await assertSucceeds(setDoc(doc(member, `${threadPath}/messages/editor-message`), tutorMessage('editor-message')))
    await assertSucceeds(setDoc(doc(member, `${threadPath}/activity/activity-1`), {
      actorId: 'editor',
      actorName: 'Editor',
      summary: 'Added a message to the conversation.',
      createdAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(member, `${threadPath}/presence/editor`), {
      uid: 'editor',
      name: 'Editor',
      online: true,
      lastActive: serverTimestamp(),
    }))
  })

  it('prevents a member self-promoting while allowing the owner to change their access', async () => {
    const { owner, member } = await inviteAndJoin('editor', 'editor')
    await assertFails(updateDoc(doc(member, `${threadPath}/tutorMembers/editor`), {
      role: 'editor',
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(owner, `${threadPath}/tutorMembers/editor`), {
      role: 'viewer',
      updatedAt: serverTimestamp(),
    }))
  })

  it('prevents a removed member from rejoining with their old invite', async () => {
    const { owner, member } = await inviteAndJoin('editor', 'editor')
    await assertSucceeds(setDoc(doc(owner, `${threadPath}/revokedAccess/editor/invites/${token}`), {
      uid: 'editor',
      inviteToken: token,
      revokedBy: 'owner',
      revokedAt: serverTimestamp(),
    }))
    await assertSucceeds(getDoc(doc(member, `${threadPath}/revokedAccess/editor/invites/${token}`)))
    await assertSucceeds(deleteDoc(doc(owner, `${threadPath}/tutorMembers/editor`)))
    await assertFails(setDoc(doc(member, `${threadPath}/tutorMembers/editor`), {
      uid: 'editor',
      role: 'editor',
      displayName: 'editor',
      invitedBy: 'owner',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })

  it('rejects oversized shared image documents', async () => {
    const { member } = await inviteAndJoin('editor', 'editor')
    const message = 'large-image'
    await assertSucceeds(setDoc(doc(member, `${threadPath}/messages/${message}`), {
      ...tutorMessage(message),
      images: [{ id: 'image-1', name: 'large.jpg', mimeType: 'image/jpeg', width: 10, height: 10 }],
    }))
    const imageRef = doc(member, `${threadPath}/messages/${message}/images/image-1`)
    await assertSucceeds(setDoc(imageRef, {
      id: 'image-1',
      data: 'A'.repeat(350_000),
      mimeType: 'image/jpeg',
      width: 10,
      height: 10,
      name: 'large.jpg',
    }))
    await assertFails(updateDoc(imageRef, {
      data: 'A'.repeat(350_001),
    }))
  })

  it('does not let an owner change immutable thread ownership', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    await assertFails(updateDoc(doc(owner, threadPath), {
      ownerId: 'attacker',
      updatedAt: serverTimestamp(),
    }))
  })
})
