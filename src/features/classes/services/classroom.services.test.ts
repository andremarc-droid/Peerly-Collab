import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'
import { archiveClass, createClass, restoreClass, rotateJoinCode, updateClass } from './classService'
import { countStudentsInClass, listEnrollments } from './enrollmentService'
import { approveEnrollment, blockStudent, declineEnrollment, removeStudent, unblockStudent } from './enrollmentService'
import { joinClass, lookupClassByCode } from './joinService'
import { deleteClassCascade } from './deleteClassCascade'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const now = Timestamp.fromMillis(1000)
const modularDb = (db: unknown) => db as Firestore

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
})
afterEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'classCodes/ABC234'), { classId: 'old', ownerId: 'teacher', className: 'Old class', ownerName: 'Teacher', joinEnabled: true, requireApproval: false, archived: false }),
    ])
  })
}

describe('classroom services', () => {
  it('retries join-code collisions, syncs code projections, and rotates/archives safely', async () => {
    await seed()
    const db = modularDb(environment.authenticatedContext('teacher').firestore())
    const choices = ['ABC234', 'DEF234']
    const created = await createClass({ ownerId: 'teacher', ownerName: 'Teacher', name: 'Biology' }, db, () => choices.shift()!)
    expect(created.joinCode).toBe('DEF234')
    await updateClass(created.id, { name: 'Biology II' }, db)
    expect((await getDoc(doc(db, 'classCodes/DEF234'))).data()?.className).toBe('Biology II')
    const rotated = await rotateJoinCode(created.id, db, () => 'GHJ234')
    expect(rotated).toBe('GHJ234')
    expect((await getDoc(doc(db, 'classCodes/DEF234'))).exists()).toBe(false)
    expect((await getDoc(doc(db, 'classCodes/GHJ234'))).data()?.classId).toBe(created.id)
    await archiveClass(created.id, db)
    expect((await getDoc(doc(db, 'classCodes/GHJ234'))).data()?.archived).toBe(true)
    await restoreClass(created.id, db)
    expect((await getDoc(doc(db, 'classCodes/GHJ234'))).data()?.archived).toBe(false)
    await deleteClassCascade(created.id, db)
  })

  it('looks up a code, creates an enrollment, and serves owner roster counts with constrained queries', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await Promise.all([
        setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
        setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
        setDoc(doc(db, 'classes/class1'), {
          ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234',
          joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
        }),
        setDoc(doc(db, 'classCodes/ABC234'), { classId: 'class1', ownerId: 'teacher', className: 'Math', ownerName: 'Teacher', joinEnabled: true, requireApproval: false, archived: false }),
      ])
    })
    const studentDb = modularDb(environment.authenticatedContext('student').firestore())
    expect((await lookupClassByCode(' ab-c234 ', 'student', studentDb))?.classId).toBe('class1')
    expect((await joinClass('ABC234', { uid: 'student', name: 'Student', photoURL: null }, studentDb)).outcome).toBe('joined')
    expect((await joinClass('ABC234', { uid: 'student', name: 'Student', photoURL: null }, studentDb)).outcome).toBe('already_member')

    const ownerDb = modularDb(environment.authenticatedContext('teacher').firestore())
    expect(await countStudentsInClass('class1', 'teacher', ownerDb)).toBe(1)
    expect((await listEnrollments('class1', 'teacher', ownerDb))).toHaveLength(1)
  })

  it('supports approval, decline, block, unblock, and removal actions', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await Promise.all([
        setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
        setDoc(doc(db, 'users/one'), { uid: 'one', role: 'student' }),
        setDoc(doc(db, 'users/two'), { uid: 'two', role: 'student' }),
        setDoc(doc(db, 'users/three'), { uid: 'three', role: 'student' }),
        setDoc(doc(db, 'classes/class1'), {
          ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234',
          joinEnabled: true, requireApproval: true, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
        }),
        setDoc(doc(db, 'classCodes/ABC234'), { classId: 'class1', ownerId: 'teacher', className: 'Math', ownerName: 'Teacher', joinEnabled: true, requireApproval: true, archived: false }),
        ...['one', 'two', 'three'].map((uid, index) => setDoc(doc(db, `enrollments/class1_${uid}`), {
          classId: 'class1', ownerId: 'teacher', uid, studentName: uid, studentPhotoURL: null, className: 'Math',
          status: index === 0 ? 'pending' : 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now,
        })),
      ])
    })
    const ownerDb = modularDb(environment.authenticatedContext('teacher').firestore())
    await approveEnrollment('class1', 'one', ownerDb)
    await blockStudent('class1', 'two', ownerDb)
    await unblockStudent('class1', 'two', ownerDb)
    await declineEnrollment('class1', 'one', ownerDb)
    await removeStudent('class1', 'two', ownerDb)
    expect((await getDoc(doc(ownerDb, 'enrollments/class1_three'))).data()?.status).toBe('active')
  })
})
