import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let env: RulesTestEnvironment
const group = { name: 'Study group', description: '', ownerId: 'owner', memberCount: 2, createdAt: new Date(), updatedAt: new Date(), joinCode: 'ABCDEFG2', joiningOpen: true }
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('groups/g1').set(group)
    await db.doc('groups/g1/members/owner').set({ role: 'owner', displayName: 'Owner', joinedAt: new Date() })
    await db.doc('groups/g1/members/member').set({ role: 'member', displayName: 'Member', joinedAt: new Date() })
    await db.doc('groups/g1/shares/s1').set({ kind: 'deck', ownerId: 'owner', title: 'Deck', snapshotPath: 'groups/g1/sharedContent/s1', sharedAt: new Date() })
    await db.doc('groups/g1/sharedContent/s1').set({ kind: 'deck', ownerId: 'owner', sourceId: 'd1', sourceClassId: 'owner', title: 'Deck', data: {}, createdAt: new Date() })
    await db.doc('users/owner/lessonPlans/p1').set({ title: 'Private plan' })
  })
})

describe('study group rules', () => {
  it('lets owners and members read group metadata, members, and deliberate snapshots only', async () => {
    for (const uid of ['owner', 'member']) {
      const db = env.authenticatedContext(uid).firestore()
      expect((await getDoc(doc(db, 'groups/g1'))).exists()).toBe(true)
      await expect(getDocs(collection(db, 'groups/g1/members'))).resolves.toBeDefined()
      expect((await getDoc(doc(db, 'groups/g1/sharedContent/s1'))).exists()).toBe(true)
    }
    const outsider = env.authenticatedContext('outsider').firestore()
    await expect(getDoc(doc(outsider, 'groups/g1'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(env.authenticatedContext('member').firestore(), 'users/owner/lessonPlans/p1'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(getDoc(doc(env.unauthenticatedContext().firestore(), 'groups/g1'))).rejects.toMatchObject({ code: 'permission-denied' })
  })
  it('blocks client-side membership and share writes, snapshot edits, and group deletion', async () => {
    const member = env.authenticatedContext('member').firestore()
    await expect(setDoc(doc(member, 'groups/g1/members/other'), { role: 'member', displayName: 'Other', joinedAt: new Date() })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(member, 'groups/g1/shares/s2'), { kind: 'deck' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(updateDoc(doc(member, 'groups/g1/sharedContent/s1'), { title: 'Changed' })).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(deleteDoc(doc(member, 'groups/g1'))).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(setDoc(doc(member, 'groups/g1/sharedContent/too-big'), { content: 'x'.repeat(900_000) })).rejects.toMatchObject({ code: 'permission-denied' })
    const owner = env.authenticatedContext('owner').firestore()
    await expect(deleteDoc(doc(owner, 'groups/g1/members/member'))).rejects.toMatchObject({ code: 'permission-denied' })
  })
})
