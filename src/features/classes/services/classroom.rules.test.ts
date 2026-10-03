import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'

const projectId = 'demo-peerly-collab'
const now = Timestamp.fromMillis(1000)
let environment: RulesTestEnvironment

const classData = (overrides: Record<string, unknown> = {}) => ({
  ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234',
  joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
  ...overrides,
})
const codeData = (overrides: Record<string, unknown> = {}) => ({
  classId: 'class1', ownerId: 'teacher', className: 'Math', ownerName: 'Teacher', joinEnabled: true, requireApproval: false, archived: false,
  ...overrides,
})
const enrollmentData = (uid: string, overrides: Record<string, unknown> = {}) => ({
  classId: 'class1', ownerId: 'teacher', uid, studentName: uid, studentPhotoURL: null, className: 'Math', status: 'active',
  codeUsed: 'ABC234', joinedAt: now, updatedAt: now, ...overrides,
})

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
})
afterEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

async function seed(overrides: { class?: Record<string, unknown>; code?: Record<string, unknown>; enrollment?: Record<string, unknown> } = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'users/other'), { uid: 'other', role: 'student' }),
      setDoc(doc(db, 'users/other2'), { uid: 'other2', role: 'student' }),
      setDoc(doc(db, 'classes/class1'), classData(overrides.class)),
      setDoc(doc(db, 'classCodes/ABC234'), codeData(overrides.code)),
      setDoc(doc(db, 'enrollments/class1_student'), enrollmentData('student', overrides.enrollment)),
    ])
  })
}

describe('classroom Firestore rules', () => {
  it('denies signed-out class, code, and enrollment access', async () => {
    await seed()
    const db = environment.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'classes/class1')))
    await assertFails(getDoc(doc(db, 'classCodes/ABC234')))
    await assertFails(getDoc(doc(db, 'enrollments/class1_student')))
  })

  it('allows an owner and active members to read a class, but not unrelated users', async () => {
    await seed()
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('teacher').firestore(), 'classes/class1')))
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('student').firestore(), 'classes/class1')))
    await assertFails(getDoc(doc(environment.authenticatedContext('other').firestore(), 'classes/class1')))
    await assertFails(setDoc(doc(environment.authenticatedContext('other').firestore(), 'classes/new'), classData({ ownerId: 'other' })))
  })

  it('allows point lookup of a join-code projection but prevents enumeration and writes by students', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(getDoc(doc(student, 'classCodes/ABC234')))
    await assertFails(getDocs(collection(student, 'classCodes')))
    await assertFails(setDoc(doc(student, 'classCodes/ZZZZZZ'), codeData({ classId: 'other' })))
  })

  it('lets a student enroll only in an open active class and applies approval state', async () => {
    await seed()
    const student = environment.authenticatedContext('other').firestore()
    const newEnrollment = { ...enrollmentData('other'), status: 'active' }
    await assertSucceeds(setDoc(doc(student, 'enrollments/class1_other'), newEnrollment))
    await assertFails(setDoc(doc(student, 'enrollments/class1_wrong'), { ...newEnrollment, uid: 'wrong' }))
    await assertFails(setDoc(doc(environment.authenticatedContext('teacher').firestore(), 'enrollments/class1_teacher'), enrollmentData('teacher')))
    await seed({ class: { requireApproval: true } })
    const secondStudent = environment.authenticatedContext('other2').firestore()
    await assertFails(setDoc(doc(secondStudent, 'enrollments/class1_other2'), { ...newEnrollment, uid: 'other2' }))
    await assertSucceeds(setDoc(doc(secondStudent, 'enrollments/class1_other2'), { ...newEnrollment, uid: 'other2', status: 'pending' }))
  })

  it('prevents new enrollment when joining is paused, a class is archived, or the student is blocked', async () => {
    const student = environment.authenticatedContext('other').firestore()
    await seed({ class: { joinEnabled: false }, code: { joinEnabled: false } })
    await assertFails(setDoc(doc(student, 'enrollments/class1_other'), enrollmentData('other')))
    await seed({ class: { status: 'archived' }, code: { archived: true } })
    await assertFails(setDoc(doc(student, 'enrollments/class1_other'), enrollmentData('other')))
    await seed({ enrollment: { status: 'blocked' } })
    await assertFails(setDoc(doc(student, 'enrollments/class1_student'), enrollmentData('student')))
  })

  it('limits enrollment records to their student or owner and requires owner filters for roster queries', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    const other = environment.authenticatedContext('other').firestore()
    await assertSucceeds(getDoc(doc(student, 'enrollments/class1_student')))
    await assertSucceeds(getDoc(doc(owner, 'enrollments/class1_student')))
    await assertFails(getDoc(doc(other, 'enrollments/class1_student')))
    await assertSucceeds(getDocs(query(collection(owner, 'enrollments'), where('ownerId', '==', 'teacher'), where('classId', '==', 'class1'))))
    await assertFails(getDocs(query(collection(owner, 'enrollments'), where('classId', '==', 'class1'))))
  })

  it('keeps class quiz data unavailable to nonmembers and serves the membership-filtered published query', async () => {
    await seed()
    const quiz = {
      ownerId: 'teacher', ownerName: 'Teacher', classId: 'class1', title: 'Practice', description: '', tags: [], mode: 'quiz',
      status: 'published', questionCount: 1, createdAt: now, updatedAt: now, publishedAt: now,
      settings: { answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'immediate', scoresReleased: false, timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false },
    }
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/q1'), quiz))
    const member = environment.authenticatedContext('student').firestore()
    const outsider = environment.authenticatedContext('other').firestore()
    await assertSucceeds(getDoc(doc(member, 'quizzes/q1')))
    await assertFails(getDoc(doc(outsider, 'quizzes/q1')))
    await assertSucceeds(getDocs(query(collection(member, 'quizzes'), where('classId', '==', 'class1'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(outsider, 'quizzes'), where('classId', '==', 'class1'), where('status', '==', 'published'))))
  })

  it('does not permit legacy unassigned quizzes to be published', async () => {
    await seed()
    const db = environment.authenticatedContext('teacher').firestore()
    const legacy = {
      ownerId: 'teacher', ownerName: 'Teacher', title: 'Legacy', description: '', tags: [], mode: 'quiz', status: 'draft',
      questionCount: 1, createdAt: now, updatedAt: now, publishedAt: null,
      settings: { answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'immediate', scoresReleased: false, timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false },
    }
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/legacy'), legacy))
    await assertFails(setDoc(doc(db, 'quizzes/legacy'), { ...legacy, status: 'published', publishedAt: now }))
  })

})
