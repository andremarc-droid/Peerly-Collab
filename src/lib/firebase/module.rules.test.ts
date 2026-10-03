import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } }) })
afterAll(async () => { await environment.cleanup() })
beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    await db.doc('enrollments/class-a_student').set({ status: 'active' })
    await db.doc('enrollments/class-a_pending').set({ status: 'pending' })
    await db.doc('enrollments/class-a_blocked').set({ status: 'blocked' })
    await db.doc('classes/class-a/modules/pub').set({ ownerId: 'owner', title: 'Published', description: '', order: 0, status: 'published', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() })
    await db.doc('classes/class-a/modules/draft').set({ ownerId: 'owner', title: 'Draft', description: '', order: 1, status: 'draft', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
    await db.doc('classes/class-a/modules/pub/resources/pub-resource').set({ type: 'text', title: 'Published notes', body: 'Notes', order: 0, createdAt: new Date(), updatedAt: new Date() })
    await db.doc('classes/class-a/modules/draft/resources/draft-resource').set({ type: 'text', title: 'Draft notes', body: 'Notes', order: 0, createdAt: new Date(), updatedAt: new Date() })
    await db.doc('classes/class-b').set({ ownerId: 'another-instructor' })
    await db.doc('classes/class-b/modules/other').set({ ownerId: 'another-instructor', title: 'Other class', description: '', order: 0, status: 'published', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() })
  })
})

describe('module access rules and query proofs', () => {
  it('allows owners to list all modules and active members to list published modules only', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(getDocs(collection(owner, 'classes/class-a/modules')))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/modules/draft')))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/modules/pub/resources/pub-resource')))
    const published = query(collection(student, 'classes/class-a/modules'), where('status', '==', 'published'))
    const result = await assertSucceeds(getDocs(published))
    if (result.docs.map((item) => item.id).join() !== 'pub') throw new Error('Student query must return only published modules.')
    await assertSucceeds(getDoc(doc(student, 'classes/class-a/modules/pub')))
    await assertSucceeds(getDoc(doc(student, 'classes/class-a/modules/pub/resources/pub-resource')))
    await assertFails(getDoc(doc(student, 'classes/class-a/modules/draft')))
    await assertFails(getDoc(doc(student, 'classes/class-a/modules/draft/resources/draft-resource')))
    await assertFails(getDocs(collection(student, 'classes/class-a/modules')))
  })
  it('denies pending, blocked, removed and nonmember students and another instructor', async () => {
    const outside = environment.authenticatedContext('outside').firestore()
    const removed = environment.authenticatedContext('removed').firestore()
    const blocked = environment.authenticatedContext('blocked').firestore()
    const pending = environment.authenticatedContext('pending').firestore()
    await assertFails(getDocs(query(collection(outside, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(removed, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(blocked, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(pending, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDoc(doc(outside, 'classes/class-a/modules/pub')))
    await assertFails(getDoc(doc(environment.authenticatedContext('another-instructor').firestore(), 'classes/class-a/modules/pub')))
  })
  it('allows the owner to create, read, update and delete modules and resources', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const batch = writeBatch(owner)
    batch.set(doc(owner, 'classes/class-a/modules/new'), { ownerId: 'owner', title: 'Owned', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
    await assertSucceeds(batch.commit())
    await assertSucceeds(updateDoc(doc(owner, 'classes/class-a/modules/new'), { title: 'Renamed' }))
    await assertSucceeds(setDoc(doc(owner, 'classes/class-a/modules/new/resources/r1'), { type: 'text', title: 'Notes', body: 'Text', order: 0, createdAt: new Date(), updatedAt: new Date() }))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/modules/new/resources/r1')))
    await assertSucceeds(updateDoc(doc(owner, 'classes/class-a/modules/new/resources/r1'), { title: 'Updated notes' }))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/modules/new/resources/r1')))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/modules/new')))
    const addBatch = writeBatch(owner)
    addBatch.update(doc(owner, 'classes/class-a/modules/pub'), { resourceCount: 1 })
    addBatch.set(doc(owner, 'classes/class-a/modules/pub/resources/owner-resource'), { type: 'text', title: 'Notes', body: 'Text', order: 1, createdAt: new Date(), updatedAt: new Date() })
    await assertSucceeds(addBatch.commit())
    await assertFails(setDoc(doc(owner, 'classes/class-a/modules/pub/resources/r2'), { type: 'link', title: 'bad', url: 'javascript:alert(1)', order: 1, createdAt: new Date(), updatedAt: new Date() }))
  })
})
