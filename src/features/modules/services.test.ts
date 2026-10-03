import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, doc, getDoc, getDocs, setDoc, type Firestore } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { deleteClassCascade } from '../classes/services/deleteClassCascade'
import { deleteQuizCascade } from '../quizzes/services/deleteQuizCascade'
import { addResource, createModule, deleteModuleCascade, deleteResource, duplicateModule, getModule, publishModule, reorderModules, reorderResources, setAttachedQuizzes, unpublishModule } from './services'

const projectId = 'demo-peerly-collab'
const classId = 'class-modules'
let environment: RulesTestEnvironment
const dbFor = (uid = 'instructor') => environment.authenticatedContext(uid).firestore() as unknown as Firestore
const textResource = (title: string) => ({ type: 'text' as const, title, body: `${title} body` })
const now = Timestamp.fromMillis(1000)

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } }) })
afterEach(async () => { await environment.clearFirestore() })
afterAll(async () => { await environment.cleanup() })

async function seedBasic() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore()
    await setDoc(doc(admin, `classes/${classId}`), { ownerId: 'instructor' })
    await setDoc(doc(admin, 'quizzes/q1'), { ownerId: 'instructor', classId })
    await setDoc(doc(admin, 'quizzes/wrong-class'), { ownerId: 'instructor', classId: 'other' })
    await setDoc(doc(admin, 'quizzes/wrong-owner'), { ownerId: 'other', classId })
  })
}

describe('module services', () => {
  it('enforces the resource limit and synchronizes counts through ordering, publishing, duplication, and deletion', async () => {
    await seedBasic()
    const db = dbFor()
    const first = await createModule(classId, 'instructor', 'Study guide', db)
    const second = await createModule(classId, 'instructor', 'Practice', db)
    await reorderModules(classId, [second, first], db)
    expect((await getModule(classId, second, db))?.order).toBe(0)
    await expect(publishModule(classId, first, db)).rejects.toThrow('at least one resource or attached quiz')
    const ids: string[] = []
    for (let index = 0; index < 10; index += 1) ids.push(await addResource(classId, first, textResource(`Resource ${index}`), db))
    await expect(addResource(classId, first, textResource('Too many'), db)).rejects.toThrow('at most 10 resources')
    await expect(deleteResource(classId, first, 'missing', db)).rejects.toThrow('Resource not found')
    expect((await getModule(classId, first, db))?.resourceCount).toBe(10)
    await reorderResources(classId, first, [...ids].reverse(), db)
    await publishModule(classId, first, db)
    expect((await getModule(classId, first, db))?.status).toBe('published')
    await unpublishModule(classId, first, db)
    const copyId = await duplicateModule(classId, first, db)
    const copy = await getModule(classId, copyId, db)
    expect(copy?.title).toBe('Copy of Study guide')
    expect(copy?.status).toBe('draft')
    expect(copy?.resourceCount).toBe(10)
    expect((await getDocs(collection(db, 'classes', classId, 'modules', copyId, 'resources'))).size).toBe(10)
    await deleteResource(classId, first, ids[0], db)
    expect((await getModule(classId, first, db))?.resourceCount).toBe(9)
    await deleteModuleCascade(classId, copyId, db)
    expect(await getModule(classId, copyId, db)).toBeNull()
  }, 30000)

  it('validates attached quiz class and owner and removes deleted quizzes from modules', async () => {
    await seedBasic()
    const db = dbFor()
    const id = await createModule(classId, 'instructor', 'Module', db)
    await expect(setAttachedQuizzes(classId, id, ['wrong-class'], 'instructor', db)).rejects.toThrow('belong to this class and owner')
    await expect(setAttachedQuizzes(classId, id, ['wrong-owner'], 'instructor', db)).rejects.toThrow()
    await setAttachedQuizzes(classId, id, ['q1'], 'instructor', db)
    await publishModule(classId, id, db)
    await deleteQuizCascade('q1', db)
    expect((await getModule(classId, id, db))?.quizIds).toEqual([])
    expect((await getDoc(doc(db, 'quizzes/q1'))).exists()).toBe(false)
  })

  it('deleteClassCascade removes every module and resource in the class', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      await setDoc(doc(admin, 'users/instructor'), { uid: 'instructor', role: 'instructor' })
      await setDoc(doc(admin, `classes/${classId}`), {
        ownerId: 'instructor', ownerName: 'Instructor', name: 'Test class', section: '', subject: '', description: '',
        joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
      })
      await setDoc(doc(admin, 'classCodes/ABC234'), { classId, ownerId: 'instructor', className: 'Test class', ownerName: 'Instructor', joinEnabled: true, requireApproval: false, archived: false })
    })
    const db = dbFor()
    const moduleId = await createModule(classId, 'instructor', 'Delete me', db)
    const resourceId = await addResource(classId, moduleId, textResource('Nested resource'), db)
    await deleteClassCascade(classId, db)
    await environment.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      expect((await getDoc(doc(admin, `classes/${classId}`))).exists()).toBe(false)
      expect((await getDoc(doc(admin, `classes/${classId}/modules/${moduleId}`))).exists()).toBe(false)
      expect((await getDoc(doc(admin, `classes/${classId}/modules/${moduleId}/resources/${resourceId}`))).exists()).toBe(false)
    })
  })
})
