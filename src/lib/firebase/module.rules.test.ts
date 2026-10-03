import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore'
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
    await db.doc('enrollments/class-a_blocked').set({ status: 'blocked' })
    await db.doc('classes/class-a/modules/pub').set({ ownerId: 'owner', title: 'Published', description: '', order: 0, status: 'published', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() })
    await db.doc('classes/class-a/modules/draft').set({ ownerId: 'owner', title: 'Draft', description: '', order: 1, status: 'draft', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
  })
})

describe('module access rules and query proofs', () => {
  it('allows owners to list all modules and active members to list published modules only', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(getDocs(collection(owner, 'classes/class-a/modules')))
    const published = query(collection(student, 'classes/class-a/modules'), where('status', '==', 'published'))
    await assertSucceeds(getDocs(published))
    await assertFails(getDocs(collection(student, 'classes/class-a/modules')))
  })
  it('denies nonmembers and blocked students, and permits owner resource creation with an atomic count update', async () => {
    const outside = environment.authenticatedContext('outside').firestore()
    const blocked = environment.authenticatedContext('blocked').firestore()
    await assertFails(getDocs(query(collection(outside, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(blocked, 'classes/class-a/modules'), where('status', '==', 'published'))))
    const owner = environment.authenticatedContext('owner').firestore()
    const batch = writeBatch(owner)
    batch.update(doc(owner, 'classes/class-a/modules/pub'), { resourceCount: 1 })
    batch.set(doc(owner, 'classes/class-a/modules/pub/resources/r1'), { type: 'text', title: 'Notes', body: 'Text', order: 0, createdAt: new Date(), updatedAt: new Date() })
    await assertSucceeds(batch.commit())
    await assertFails(setDoc(doc(owner, 'classes/class-a/modules/pub/resources/r2'), { type: 'link', title: 'bad', url: 'javascript:alert(1)', order: 1, createdAt: new Date(), updatedAt: new Date() }))
  })
})
