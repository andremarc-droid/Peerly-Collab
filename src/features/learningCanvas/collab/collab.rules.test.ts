import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import rules from '../../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
const canvasPath = 'classes/class-a/learningCanvases/canvas-a'
const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
})

afterAll(async () => environment.cleanup())

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    await db.doc('enrollments/class-a_editor').set({ status: 'active' })
    await db.doc('enrollments/class-a_viewer').set({ status: 'active' })
    await db.doc(canvasPath).set({
      ownerId: 'owner',
      classId: 'class-a',
      kind: 'class',
      title: 'Shared canvas',
      description: '',
      status: 'draft',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.doc(`${canvasPath}/content/main`).set({
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  })
})

async function inviteAndJoin(role: 'viewer' | 'editor', uid: string) {
  const owner = environment.authenticatedContext('owner').firestore()
  const member = environment.authenticatedContext(uid).firestore()
  await assertSucceeds(setDoc(doc(owner, `${canvasPath}/invites/${token}`), {
    createdBy: 'owner',
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: null,
  }))
  await assertSucceeds(setDoc(doc(member, `${canvasPath}/members/${uid}`), {
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

describe('Canvas collaboration security rules', () => {
  it('lets an owner grant a class member read-only access but not edit access', async () => {
    const { member } = await inviteAndJoin('viewer', 'viewer')
    await assertSucceeds(getDoc(doc(member, `${canvasPath}/content/main`)))
    await assertFails(updateDoc(doc(member, `${canvasPath}/content/main`), {
      nodes: [{ id: 'viewer-card' }],
    }))
  })

  it('lets an invited editor save and log changes but prevents self-promotion', async () => {
    const { owner, member } = await inviteAndJoin('editor', 'editor')
    await assertSucceeds(getDocs(query(collectionGroup(member, 'members'), where('uid', '==', 'editor'))))
    await assertSucceeds(updateDoc(doc(member, `${canvasPath}/content/main`), {
      nodes: [{ id: 'editor-card' }],
    }))
    await assertSucceeds(setDoc(doc(member, `${canvasPath}/activity/edit-entry`), {
      actorId: 'editor',
      actorName: 'Editor',
      type: 'edit',
      summary: 'Added 1 card',
      changes: ['Added a text card'],
      createdAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(member, `${canvasPath}/members/editor`), {
      role: 'editor',
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(owner, `${canvasPath}/members/editor`), {
      role: 'viewer',
      updatedAt: serverTimestamp(),
    }))
  })

  it('rejects invite acceptance by a user who is not an active class member', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertSucceeds(setDoc(doc(owner, `${canvasPath}/invites/${token}`), {
      createdBy: 'owner',
      role: 'editor',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertFails(setDoc(doc(outsider, `${canvasPath}/members/outsider`), {
      uid: 'outsider',
      role: 'editor',
      displayName: 'Outsider',
      invitedBy: 'owner',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })

  const personalCanvas = (ownerId: string, classId: string) => ({
    ownerId,
    classId,
    kind: 'personal',
    title: 'Personal canvas',
    description: '',
    status: 'private',
    nodeCount: 0,
    edgeCount: 0,
    refs: [],
    sourceCanvasId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  it('lets an invite holder join a personal canvas kept in its owner\'s own workspace', async () => {
    const soloPath = 'classes/solo-owner/learningCanvases/solo-canvas'
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await db.doc(soloPath).set(personalCanvas('solo-owner', 'solo-owner'))
      await db.doc(`${soloPath}/content/main`).set({ version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } })
    })
    const owner = environment.authenticatedContext('solo-owner').firestore()
    const friend = environment.authenticatedContext('friend').firestore()
    await assertSucceeds(setDoc(doc(owner, `${soloPath}/invites/${token}`), {
      createdBy: 'solo-owner',
      role: 'viewer',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertSucceeds(setDoc(doc(friend, `${soloPath}/members/friend`), {
      uid: 'friend',
      role: 'viewer',
      displayName: 'Friend',
      invitedBy: 'solo-owner',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(getDoc(doc(friend, `${soloPath}/content/main`)))
    await assertFails(updateDoc(doc(friend, `${soloPath}/content/main`), { nodes: [{ id: 'friend-card' }] }))
  })

  it('still requires class membership for a personal canvas inside a real class', async () => {
    const inClassPath = 'classes/class-a/learningCanvases/personal-in-class'
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(inClassPath).set(personalCanvas('student-a', 'class-a'))
    })
    const owner = environment.authenticatedContext('student-a').firestore()
    const outsider = environment.authenticatedContext('outsider').firestore()
    await assertSucceeds(setDoc(doc(owner, `${inClassPath}/invites/${token}`), {
      createdBy: 'student-a',
      role: 'viewer',
      active: true,
      createdAt: serverTimestamp(),
      expiresAt: null,
    }))
    await assertFails(setDoc(doc(outsider, `${inClassPath}/members/outsider`), {
      uid: 'outsider',
      role: 'viewer',
      displayName: 'Outsider',
      invitedBy: 'student-a',
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))
  })
})
