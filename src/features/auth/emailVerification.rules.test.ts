import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import rules from '../../../firestore.rules?raw'

const projectId = 'demo-peerly-collab'
const now = Timestamp.fromMillis(1000)
let environment: RulesTestEnvironment

const classData = (ownerId: string, joinCode: string, overrides: Record<string, unknown> = {}) => ({
  ownerId,
  ownerName: 'Instructor',
  name: 'Science 101',
  section: 'A',
  subject: 'Science',
  description: 'Introductory course',
  joinCode,
  joinEnabled: true,
  requireApproval: false,
  status: 'active',
  accent: 'pinstripe',
  createdAt: now,
  updatedAt: now,
  codeRotatedAt: now,
  ...overrides,
})

const codeData = (classId: string, ownerId: string, _joinCode: string, overrides: Record<string, unknown> = {}) => ({
  classId,
  ownerId,
  className: 'Science 101',
  ownerName: 'Instructor',
  joinEnabled: true,
  requireApproval: false,
  archived: false,
  ...overrides,
})

const enrollmentData = (classId: string, uid: string, ownerId: string, codeUsed: string) => ({
  classId,
  ownerId,
  uid,
  studentName: uid,
  studentPhotoURL: null,
  className: 'Science 101',
  status: 'active',
  codeUsed,
  joinedAt: now,
  updatedAt: now,
})

const quizData = (ownerId: string, classId: string) => ({
  ownerId,
  ownerName: 'Instructor',
  classId,
  title: 'Quiz 1',
  description: 'First quiz',
  tags: [],
  mode: 'quiz',
  status: 'draft',
  questionCount: 0,
  publishedAt: null,
  settings: {
    answerReveal: 'after_submit',
    participation: { type: 'individual' },
    scoreVisibility: 'immediate',
    scoresReleased: false,
    timeLimitMinutes: null,
    attemptsAllowed: null,
    shuffleQuestions: false,
    shuffleOptions: false,
  },
  createdAt: now,
  updatedAt: now,
})

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
}, 30_000)

afterEach(async () => environment?.clearFirestore())
afterAll(async () => {
  await environment?.cleanup()
})

async function seedPrerequisites() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/unverifiedTeacher'), { uid: 'unverifiedTeacher', role: 'instructor' }),
      setDoc(doc(db, 'users/verifiedTeacher'), { uid: 'verifiedTeacher', role: 'instructor' }),
      setDoc(doc(db, 'users/googleTeacher'), { uid: 'googleTeacher', role: 'instructor' }),
      setDoc(doc(db, 'users/unverifiedStudent'), { uid: 'unverifiedStudent', role: 'student' }),
      setDoc(doc(db, 'users/verifiedStudent'), { uid: 'verifiedStudent', role: 'student' }),
      // Existing active class for enrollment & quiz testing
      setDoc(doc(db, 'classes/activeClass'), classData('verifiedTeacher', 'ABC234')),
      setDoc(doc(db, 'classCodes/ABC234'), codeData('activeClass', 'verifiedTeacher', 'ABC234')),
    ])
  })
}

describe('Firestore rules email verification gate', () => {
  describe('class creation', () => {
    it('denies class creation when password account has unverified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('unverifiedTeacher', {
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      const batch = writeBatch(db)
      batch.set(doc(db, 'classes/c1'), classData('unverifiedTeacher', 'ABC234'))
      batch.set(doc(db, 'classCodes/ABC234'), codeData('c1', 'unverifiedTeacher', 'ABC234'))
      await assertFails(batch.commit())
    })

    it('allows class creation when password account has verified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('verifiedTeacher', {
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      const batch = writeBatch(db)
      batch.set(doc(db, 'classes/c2'), classData('verifiedTeacher', 'DEF234'))
      batch.set(doc(db, 'classCodes/DEF234'), codeData('c2', 'verifiedTeacher', 'DEF234'))
      await assertSucceeds(batch.commit())
    })

    it('allows class creation when signed in with Google (google.com)', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('googleTeacher', {
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore()

      const batch = writeBatch(db)
      batch.set(doc(db, 'classes/c3'), classData('googleTeacher', 'GHJ234'))
      batch.set(doc(db, 'classCodes/GHJ234'), codeData('c3', 'googleTeacher', 'GHJ234'))
      await assertSucceeds(batch.commit())
    })
  })

  describe('enrollment creation', () => {
    it('denies enrollment creation when password student has unverified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('unverifiedStudent', {
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      await assertFails(
        setDoc(
          doc(db, 'enrollments/activeClass_unverifiedStudent'),
          enrollmentData('activeClass', 'unverifiedStudent', 'verifiedTeacher', 'ABC234'),
        ),
      )
    })

    it('allows enrollment creation when password student has verified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('verifiedStudent', {
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      await assertSucceeds(
        setDoc(
          doc(db, 'enrollments/activeClass_verifiedStudent'),
          enrollmentData('activeClass', 'verifiedStudent', 'verifiedTeacher', 'ABC234'),
        ),
      )
    })
  })

  describe('quiz creation', () => {
    it('denies quiz creation when password instructor has unverified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('unverifiedTeacher', {
        email_verified: false,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      await assertFails(
        setDoc(
          doc(db, 'quizzes/q1'),
          quizData('unverifiedTeacher', 'activeClass'),
        ),
      )
    })

    it('allows quiz creation when password instructor has verified email', async () => {
      await seedPrerequisites()
      const db = environment.authenticatedContext('verifiedTeacher', {
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore()

      await assertSucceeds(
        setDoc(
          doc(db, 'quizzes/q2'),
          quizData('verifiedTeacher', 'activeClass'),
        ),
      )
    })
  })
})
