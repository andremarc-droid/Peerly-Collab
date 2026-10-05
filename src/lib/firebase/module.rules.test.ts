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
    await db.doc('classes/class-a/modules/pub').set({ ownerId: 'owner', title: 'Published', description: '', order: 0, status: 'published', quizIds: [], resourceCount: 1, createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date() })
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
    const otherInstructor = environment.authenticatedContext('another-instructor').firestore()
    await assertFails(getDocs(query(collection(outside, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(removed, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(blocked, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(pending, 'classes/class-a/modules'), where('status', '==', 'published'))))
    await assertFails(getDoc(doc(outside, 'classes/class-a/modules/pub')))
    await assertFails(getDoc(doc(outside, 'classes/class-a/modules/draft')))
    await assertFails(getDoc(doc(otherInstructor, 'classes/class-a/modules/pub')))
    await assertFails(getDoc(doc(otherInstructor, 'classes/class-a/modules/draft')))
    await assertFails(getDoc(doc(otherInstructor, 'classes/class-a/modules/draft/resources/draft-resource')))
    await assertFails(setDoc(doc(environment.authenticatedContext('student').firestore(), 'classes/class-a/modules/student-created'), {
      ownerId: 'student', title: 'Not allowed', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 0,
      createdAt: new Date(), updatedAt: new Date(), publishedAt: null,
    }))
  })
  it('allows the owner to create, read, update and delete modules and resources', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const batch = writeBatch(owner)
    batch.set(doc(owner, 'classes/class-a/modules/new'), { ownerId: 'owner', title: 'Owned', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
    await assertSucceeds(batch.commit())
    await assertSucceeds(updateDoc(doc(owner, 'classes/class-a/modules/new'), { title: 'Renamed' }))
    const firstResource = writeBatch(owner)
    firstResource.update(doc(owner, 'classes/class-a/modules/new'), { resourceCount: 1 })
    firstResource.set(doc(owner, 'classes/class-a/modules/new/resources/r1'), { type: 'text', title: 'Notes', body: 'Text', order: 0, createdAt: new Date(), updatedAt: new Date() })
    await assertSucceeds(firstResource.commit())
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/modules/new/resources/r1')))
    await assertSucceeds(updateDoc(doc(owner, 'classes/class-a/modules/new/resources/r1'), { title: 'Updated notes' }))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/modules/new/resources/r1')))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/modules/new')))
    const addBatch = writeBatch(owner)
    addBatch.update(doc(owner, 'classes/class-a/modules/pub'), { resourceCount: 2 })
    addBatch.set(doc(owner, 'classes/class-a/modules/pub/resources/owner-resource'), { type: 'text', title: 'Notes', body: 'Text', order: 1, createdAt: new Date(), updatedAt: new Date() })
    await assertSucceeds(addBatch.commit())
    const badUrl = writeBatch(owner)
    badUrl.update(doc(owner, 'classes/class-a/modules/pub'), { resourceCount: 3 })
    badUrl.set(doc(owner, 'classes/class-a/modules/pub/resources/r2'), { type: 'link', title: 'bad', url: 'javascript:alert(1)', order: 2, createdAt: new Date(), updatedAt: new Date() })
    await assertFails(badUrl.commit())
  })

  it('denies resource creation without an existing owner parent and synchronized resourceCount', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const resource = { type: 'text', title: 'Notes', body: 'Text', order: 0, createdAt: new Date(), updatedAt: new Date() }
    await assertFails(setDoc(doc(owner, 'classes/class-a/modules/missing/resources/orphan'), resource))

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await db.doc('classes/class-a/modules/other-owner').set({ ownerId: 'another-instructor', title: 'Other owner', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 0, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
      for (let index = 0; index < 10; index += 1) {
        await db.doc(`classes/class-a/modules/at-limit/resources/r${index}`).set({ ...resource, order: index })
      }
      await db.doc('classes/class-a/modules/at-limit').set({ ownerId: 'owner', title: 'At limit', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 10, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
    })

    await assertFails(setDoc(doc(owner, 'classes/class-a/modules/other-owner/resources/attempt'), resource))
    const outsider = environment.authenticatedContext('another-instructor').firestore()
    const outsiderBatch = writeBatch(outsider)
    outsiderBatch.set(doc(outsider, 'classes/class-a/modules/outsider-parent'), { ownerId: 'another-instructor', title: 'Forbidden', description: '', order: 3, status: 'draft', quizIds: [], resourceCount: 1, createdAt: new Date(), updatedAt: new Date(), publishedAt: null })
    outsiderBatch.set(doc(outsider, 'classes/class-a/modules/outsider-parent/resources/r1'), resource)
    await assertFails(outsiderBatch.commit())

    const tooMany = writeBatch(owner)
    tooMany.update(doc(owner, 'classes/class-a/modules/at-limit'), { resourceCount: 11 })
    tooMany.set(doc(owner, 'classes/class-a/modules/at-limit/resources/r10'), { ...resource, order: 10 })
    await assertFails(tooMany.commit())

    const student = environment.authenticatedContext('student').firestore()
    const studentBatch = writeBatch(student)
    studentBatch.update(doc(student, 'classes/class-a/modules/pub'), { resourceCount: 1 })
    studentBatch.set(doc(student, 'classes/class-a/modules/pub/resources/student-write'), resource)
    await assertFails(studentBatch.commit())

    const inconsistent = writeBatch(owner)
    inconsistent.update(doc(owner, 'classes/class-a/modules/pub'), { resourceCount: 1 })
    inconsistent.set(doc(owner, 'classes/class-a/modules/pub/resources/unsynced'), { ...resource, order: 1 })
    await assertFails(inconsistent.commit())
  })

  it('allows the owner to create a module and multiple resources atomically', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const now = new Date()
    const batch = writeBatch(owner)
    batch.set(doc(owner, 'classes/class-a/modules/multi'), { ownerId: 'owner', title: 'Multi resource', description: '', order: 2, status: 'draft', quizIds: [], resourceCount: 3, createdAt: now, updatedAt: now, publishedAt: null })
    for (let index = 0; index < 3; index += 1) batch.set(doc(owner, `classes/class-a/modules/multi/resources/r${index}`), { type: 'text', title: `Notes ${index}`, body: 'Text', order: index, createdAt: now, updatedAt: now })
    await assertSucceeds(batch.commit())
  })

  it('validates resource host URLs strictly for drive, youtube, and generic links', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const now = new Date()

    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('classes/class-a/modules/url-tests').set({
        ownerId: 'owner', title: 'URL tests', description: '', order: 5, status: 'draft', quizIds: [], resourceCount: 0, createdAt: now, updatedAt: now, publishedAt: null,
      })
    })

    const testUrl = async (type: 'drive' | 'youtube' | 'link', url: string, shouldPass: boolean) => {
      const extraFields = type === 'drive'
        ? { driveFileId: 'abc1234567', driveKind: 'doc' as const }
        : type === 'youtube'
          ? { youtubeVideoId: '12345678901' }
          : {}
      const batch = writeBatch(owner)
      batch.update(doc(owner, 'classes/class-a/modules/url-tests'), { resourceCount: 1 })
      batch.set(doc(owner, 'classes/class-a/modules/url-tests/resources/r0'), {
        type, title: 'Resource', order: 0, url, createdAt: now, updatedAt: now, ...extraFields,
      })
      if (shouldPass) {
        await assertSucceeds(batch.commit())
        const cleanup = writeBatch(owner)
        cleanup.delete(doc(owner, 'classes/class-a/modules/url-tests/resources/r0'))
        cleanup.update(doc(owner, 'classes/class-a/modules/url-tests'), { resourceCount: 0 })
        await cleanup.commit()
      } else {
        await assertFails(batch.commit())
      }
    }

    // Drive allowed
    await testUrl('drive', 'https://drive.google.com/file/d/123/view', true)
    await testUrl('drive', 'https://docs.google.com/document/d/123/edit', true)

    // Drive denied lookalikes and invalid hosts
    await testUrl('drive', 'https://drive.google.com.evil.com/file', false)
    await testUrl('drive', 'https://docs.google.com.evil.com/doc', false)
    await testUrl('drive', 'https://evil.com/drive.google.com/file', false)
    await testUrl('drive', 'http://drive.google.com/file', false)

    // YouTube allowed
    await testUrl('youtube', 'https://www.youtube.com/watch?v=123', true)
    await testUrl('youtube', 'https://youtube.com/watch?v=123', true)
    await testUrl('youtube', 'https://youtu.be/123', true)
    await testUrl('youtube', 'https://www.youtube-nocookie.com/embed/123', true)
    await testUrl('youtube', 'https://youtube-nocookie.com/embed/123', true)

    // YouTube denied lookalikes and invalid hosts
    await testUrl('youtube', 'https://youtube.com.evil.com/video', false)
    await testUrl('youtube', 'https://youtu.be.evil.com/video', false)
    await testUrl('youtube', 'https://youtube-nocookie.com.evil.com/embed/123', false)
    await testUrl('youtube', 'https://evil.com/youtube.com/watch', false)
    await testUrl('youtube', 'http://youtube.com/watch?v=123', false)

    // Link allowed (any https URL)
    await testUrl('link', 'https://example.com/notes', true)
    await testUrl('link', 'https://my-school.edu/guide.pdf', true)

    // Link denied (non-https)
    await testUrl('link', 'http://example.com/insecure', false)
    await testUrl('link', 'javascript:alert(1)', false)
  })
})
