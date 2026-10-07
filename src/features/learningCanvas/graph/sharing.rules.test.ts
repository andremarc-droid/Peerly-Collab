import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import rules from '../../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-graph-sharing'
const graphPath = 'classes/class-a/graphViews/graph-a'
const otherGraphPath = 'classes/class-a/graphViews/graph-b'
const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
}, 60_000)

afterAll(async () => environment?.cleanup())

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    await db.doc('enrollments/class-a_editor').set({ status: 'active' })
    await db.doc('enrollments/class-a_viewer').set({ status: 'active' })
    await db.doc(graphPath).set({
      ownerId: 'owner',
      ownerName: 'Owner',
      classId: 'class-a',
      title: 'Shared graph',
      nodeIds: ['note:one'],
      positions: { 'note:one': { x: 10, y: 20, isFixed: true } },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.doc(otherGraphPath).set({
      ownerId: 'owner',
      ownerName: 'Owner',
      classId: 'class-a',
      title: 'Another graph',
      nodeIds: [],
      positions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })
})

async function inviteAndJoin(role: 'viewer' | 'editor', uid: string) {
  const owner = environment.authenticatedContext('owner').firestore()
  const member = environment.authenticatedContext(uid).firestore()
  await assertSucceeds(setDoc(doc(owner, `${graphPath}/invites/${token}`), {
    createdBy: 'owner',
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: null,
  }))
  await assertSucceeds(setDoc(doc(member, `${graphPath}/members/${uid}`), {
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

describe('Graph view sharing security rules', () => {
  it('lets an active class member save an individually owned graph view', async () => {
    const student = environment.authenticatedContext('viewer').firestore()
    await assertSucceeds(setDoc(doc(student, 'classes/class-a/graphViews/student-graph'), {
      ownerId: 'viewer',
      ownerName: 'Viewer',
      classId: 'class-a',
      title: 'My class graph',
      nodeIds: ['module:one'],
      positions: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })

  it('grants only the invited active class member viewer access', async () => {
    const { member } = await inviteAndJoin('viewer', 'viewer')
    await assertSucceeds(getDoc(doc(member, graphPath)))
    await assertSucceeds(getDocs(collection(member, `${graphPath}/members`)))
    await assertFails(getDoc(doc(member, otherGraphPath)))
    await assertFails(setDoc(doc(member, `${graphPath}/activity/joined`), {
      actorId: 'viewer',
      actorName: 'Viewer',
      type: 'member',
      summary: 'Joined as viewer',
      changes: [],
      createdAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(member, graphPath), {
      nodeIds: ['note:changed'],
      updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(member, `${graphPath}/activity/forged-edit`), {
      actorId: 'viewer',
      actorName: 'Viewer',
      type: 'edit',
      summary: 'Pretended to edit',
      changes: [],
      createdAt: serverTimestamp(),
    }))
  })

  it('allows an invited editor to sync graph configuration and append activity', async () => {
    const { member } = await inviteAndJoin('editor', 'editor')
    await assertSucceeds(updateDoc(doc(member, graphPath), {
      nodeIds: ['note:changed'],
      positions: { 'note:changed': { x: 40, y: 50, isFixed: true } },
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(setDoc(doc(member, `${graphPath}/activity/change-1`), {
      actorId: 'editor',
      actorName: 'Editor',
      type: 'edit',
      summary: 'Updated the graph layout',
      changes: [],
      createdAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(member, `${graphPath}/members/editor`), {
      role: 'editor',
      updatedAt: serverTimestamp(),
    }))
  })

  it('allows collaborators to publish only their own online presence', async () => {
    const { member } = await inviteAndJoin('viewer', 'viewer')
    await assertSucceeds(setDoc(doc(member, `${graphPath}/presence/viewer`), {
      uid: 'viewer',
      name: 'Viewer',
      online: true,
      lastActive: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(member, `${graphPath}/presence/owner`), {
      uid: 'owner',
      name: 'Owner',
      online: true,
      lastActive: serverTimestamp(),
    }))
  })

  it('removes graph access when the owner revokes a collaborator', async () => {
    const { owner, member } = await inviteAndJoin('viewer', 'viewer')
    await assertSucceeds(getDoc(doc(member, graphPath)))
    await assertSucceeds(deleteDoc(doc(owner, `${graphPath}/members/viewer`)))
    await assertFails(getDoc(doc(member, graphPath)))
  })

  it('rejects invite acceptance for a user without active class membership', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertSucceeds(setDoc(doc(owner, `${graphPath}/invites/${token}`), {
      createdBy: 'owner',
      role: 'editor',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertFails(setDoc(doc(outsider, `${graphPath}/members/outsider`), {
      uid: 'outsider',
      role: 'editor',
      displayName: 'Outsider',
      invitedBy: 'owner',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertFails(getDoc(doc(outsider, graphPath)))
  })
})
