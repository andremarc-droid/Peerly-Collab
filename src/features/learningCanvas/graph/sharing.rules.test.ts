import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  collectionGroup,
  doc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import rules from '../../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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
      nodes: [{
        id: 'note:one',
        rawId: 'one',
        type: 'note',
        title: 'Graph visible outside the class',
        classId: 'class-a',
        className: 'Class A',
        x: 10,
        y: 20,
      }],
      links: [],
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
      nodes: [],
      links: [],
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
    await assertFails(getDocs(query(
      collection(member, 'classes/class-a/graphViews'),
      where('ownerId', '==', 'owner'),
    )))
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
      links: [{ id: 'note:one->note:changed', source: 'note:one', target: 'note:changed' }],
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
      nodeIds: ['note:one', 'note:two'],
      positions: { 'note:two': { x: 40, y: 50, isFixed: true } },
      nodes: [
        {
          id: 'note:one',
          rawId: 'one',
          type: 'note',
          title: 'First note',
          classId: 'class-a',
          className: 'Class A',
          x: 10,
          y: 20,
        },
        {
          id: 'note:two',
          rawId: 'two',
          type: 'note',
          title: 'Second note',
          classId: 'class-a',
          className: 'Class A',
          x: 40,
          y: 50,
        },
      ],
      links: [{ id: 'note:one->note:two', source: 'note:one', target: 'note:two' }],
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
    const overLimitLinks = Array.from({ length: 121 }, (_, index) => ({
      id: `note:${index}->note:${index + 1}`,
      source: `note:${index}`,
      target: `note:${index + 1}`,
    }))
    await assertFails(updateDoc(doc(member, graphPath), {
      links: overLimitLinks,
      updatedAt: serverTimestamp(),
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

  it('allows anyone with the invite code to join without class membership', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertSucceeds(setDoc(doc(owner, `${graphPath}/invites/${token}`), {
      createdBy: 'owner',
      code: 'ABCD2345',
      role: 'viewer',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertSucceeds(setDoc(doc(outsider, `${graphPath}/members/outsider`), {
      uid: 'outsider',
      role: 'viewer',
      displayName: 'Outsider',
      invitedBy: 'owner',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    const graph = await assertSucceeds(getDoc(doc(outsider, graphPath)))
    expect(graph.data()?.nodes[0].title).toBe('Graph visible outside the class')
    const sharedMemberships = await assertSucceeds(
      getDocs(query(collectionGroup(outsider, 'members'), where('uid', '==', 'outsider'))),
    )
    expect(sharedMemberships.docs.some((member) => member.ref.parent.parent?.id === 'graph-a')).toBe(true)
    await assertFails(updateDoc(doc(outsider, graphPath), {
      nodeIds: ['note:changed'],
      updatedAt: serverTimestamp(),
    }))
  })

  it('lets the owner register a code for an existing graph invitation', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const code = 'ABCD2345'
    await assertSucceeds(setDoc(doc(owner, `${graphPath}/invites/${token}`), {
      createdBy: 'owner',
      code,
      role: 'editor',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertSucceeds(setDoc(doc(owner, `learningInviteCodes/${code}`), {
      kind: 'graph',
      classId: 'class-a',
      itemId: 'graph-a',
      inviteToken: token,
      ownerId: 'owner',
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertSucceeds(getDoc(doc(outsider, `learningInviteCodes/${code}`)))
    await assertFails(getDocs(collection(outsider, 'learningInviteCodes')))
  })
})
