import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'

const projectId = 'demo-peerly-collab'
const now = Timestamp.fromMillis(1000)
let environment: RulesTestEnvironment

const classData = (ownerId: string, overrides: Record<string, unknown> = {}) => ({
  ownerId,
  ownerName: 'Instructor',
  name: 'Biology 101',
  section: 'A',
  subject: 'Science',
  description: 'Introductory biology',
  joinCode: 'ABC234',
  joinEnabled: true,
  requireApproval: false,
  status: 'active',
  accent: 'pinstripe',
  createdAt: now,
  updatedAt: now,
  codeRotatedAt: now,
  ...overrides,
})

const codeData = (classId: string, ownerId: string, overrides: Record<string, unknown> = {}) => ({
  classId,
  ownerId,
  className: 'Biology 101',
  ownerName: 'Instructor',
  joinEnabled: true,
  requireApproval: false,
  archived: false,
  ...overrides,
})

const personalCanvasData = (ownerId: string, classId: string) => ({
  ownerId,
  classId,
  kind: 'personal',
  title: 'My Notes',
  description: 'Study canvas',
  status: 'private',
  nodeCount: 1,
  edgeCount: 0,
  refs: [],
  createdAt: now,
  updatedAt: now,
})

const personalDeckData = (ownerId: string, classId: string) => ({
  ownerId,
  classId,
  kind: 'personal',
  title: 'My Flashcards',
  description: '',
  status: 'private',
  cardCount: 1,
  cards: [{ id: 'c1', front: 'Question', back: 'Answer' }],
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

async function seedUsers() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher1'), { uid: 'teacher1', role: 'instructor' }),
      setDoc(doc(db, 'publicProfiles/teacher1'), { uid: 'teacher1', role: 'instructor', displayName: 'Teacher 1' }),
      setDoc(doc(db, 'users/student1'), { uid: 'student1', role: 'student' }),
      setDoc(doc(db, 'publicProfiles/student1'), { uid: 'student1', role: 'student', displayName: 'Student 1' }),
    ])
  })
}

describe('personal-workspace partition squatting prevention', () => {
  it('(a) an instructor cannot create classes/{otherUid}', async () => {
    await seedUsers()
    const teacherDb = environment.authenticatedContext('teacher1').firestore()
    const batch = writeBatch(teacherDb)
    batch.set(doc(teacherDb, 'classes/student1'), classData('teacher1', { joinCode: 'STU123' }))
    batch.set(doc(teacherDb, 'classCodes/STU123'), codeData('student1', 'teacher1'))
    await assertFails(batch.commit())
  })

  it('an instructor cannot create classes/{theirOwnUid}', async () => {
    await seedUsers()
    const teacherDb = environment.authenticatedContext('teacher1').firestore()
    const batch = writeBatch(teacherDb)
    batch.set(doc(teacherDb, 'classes/teacher1'), classData('teacher1', { joinCode: 'TEA123' }))
    batch.set(doc(teacherDb, 'classCodes/TEA123'), codeData('teacher1', 'teacher1'))
    await assertFails(batch.commit())
  })

  it('(c) normal class creation with an auto id still works', async () => {
    await seedUsers()
    const teacherDb = environment.authenticatedContext('teacher1', {
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
    }).firestore()
    const batch = writeBatch(teacherDb)
    batch.set(doc(teacherDb, 'classes/autoClass123'), classData('teacher1', { joinCode: 'AUT234' }))
    batch.set(doc(teacherDb, 'classCodes/AUT234'), codeData('autoClass123', 'teacher1'))
    await assertSucceeds(batch.commit())
  })

  it('(b) even if a squat class existed, teacher cannot delete victim student personal canvas or deck', async () => {
    await seedUsers()
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      // Simulate squatted class
      await setDoc(doc(db, 'classes/student1'), classData('teacher1', { joinCode: 'SQT123' }))
      await setDoc(doc(db, 'classCodes/SQT123'), codeData('student1', 'teacher1'))
      // Student personal items under their own UID partition
      await setDoc(doc(db, 'classes/student1/learningCanvases/canvas1'), personalCanvasData('student1', 'student1'))
      await setDoc(doc(db, 'classes/student1/learningCanvases/canvas1/content/main'), {
        version: 1,
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      })
      await setDoc(doc(db, 'classes/student1/flashcardDecks/deck1'), personalDeckData('student1', 'student1'))
    })

    const teacherDb = environment.authenticatedContext('teacher1').firestore()
    // Teacher attempts to delete victim's personal canvas, content, and deck
    await assertFails(deleteDoc(doc(teacherDb, 'classes/student1/learningCanvases/canvas1')))
    await assertFails(deleteDoc(doc(teacherDb, 'classes/student1/learningCanvases/canvas1/content/main')))
    await assertFails(deleteDoc(doc(teacherDb, 'classes/student1/flashcardDecks/deck1')))

    // Student can still delete their own personal canvas, content, and deck
    const studentDb = environment.authenticatedContext('student1').firestore()
    await assertSucceeds(deleteDoc(doc(studentDb, 'classes/student1/learningCanvases/canvas1/content/main')))
    await assertSucceeds(deleteDoc(doc(studentDb, 'classes/student1/learningCanvases/canvas1')))
    await assertSucceeds(deleteDoc(doc(studentDb, 'classes/student1/flashcardDecks/deck1')))
  })
})
