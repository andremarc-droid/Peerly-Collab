import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const now = new Date()
const canvas = (uid: string, sourceCanvasId: string | null = null) => ({ ownerId: uid, classId: uid, kind: 'personal', title: 'My study canvas', description: '', status: 'private', nodeCount: 0, edgeCount: 0, refs: [], sourceCanvasId, createdAt: now, updatedAt: now })
const deck = (uid: string) => ({ ownerId: uid, classId: uid, kind: 'personal', title: 'My deck', description: '', status: 'private', cardCount: 1, cards: [{ id: 'card1', front: 'Term', back: 'Meaning' }], createdAt: now, updatedAt: now })
const content = { version: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
let environment: RulesTestEnvironment

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => environment.cleanup())
beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('users/new-student').set({ role: 'student' })
    await db.doc('users/new-instructor').set({ role: 'instructor' })
  })
})

async function provePersonalLearningCrud(uid: string) {
  const db = environment.authenticatedContext(uid).firestore()
  const canvasRef = doc(db, `classes/${uid}/learningCanvases/canvas-a`)
  await assertSucceeds(setDoc(canvasRef, canvas(uid)))
  await assertSucceeds(setDoc(doc(canvasRef, 'content/main'), content))
  await assertSucceeds(getDoc(canvasRef))
  await assertSucceeds(updateDoc(canvasRef, { title: 'Renamed canvas', updatedAt: new Date() }))
  await assertSucceeds(deleteDoc(doc(canvasRef, 'content/main')))
  await assertSucceeds(deleteDoc(canvasRef))

  // Learning notes use the personal-canvas schema with sourceCanvasId='note'.
  const noteRef = doc(db, `classes/${uid}/learningCanvases/note-a`)
  await assertSucceeds(setDoc(noteRef, canvas(uid, 'note')))
  await assertSucceeds(setDoc(doc(noteRef, 'content/main'), content))
  await assertSucceeds(getDoc(noteRef))
  await assertSucceeds(updateDoc(noteRef, { title: 'Renamed note', updatedAt: new Date() }))
  await assertSucceeds(deleteDoc(doc(noteRef, 'content/main')))
  await assertSucceeds(deleteDoc(noteRef))

  const deckRef = doc(db, `classes/${uid}/flashcardDecks/deck-a`)
  await assertSucceeds(setDoc(deckRef, deck(uid)))
  await assertSucceeds(getDoc(deckRef))
  await assertSucceeds(updateDoc(deckRef, { title: 'Renamed deck', updatedAt: new Date() }))
  await assertSucceeds(deleteDoc(deckRef))
}

describe('fresh account personal Learning access', () => {
  it('allows a new student profile with no classes or enrollments to manage personal content', async () => {
    await provePersonalLearningCrud('new-student')
  })

  it('allows a new instructor profile with no classes or enrollments to manage personal content', async () => {
    await provePersonalLearningCrud('new-instructor')
  })

  it('denies creating personal content under another user or another class', async () => {
    const db = environment.authenticatedContext('new-student').firestore()
    await assertFails(setDoc(doc(db, 'classes/another-user/learningCanvases/canvas-a'), canvas('new-student')))
    await assertFails(setDoc(doc(db, 'classes/class-without-enrollment/learningCanvases/canvas-a'), { ...canvas('new-student'), classId: 'class-without-enrollment' }))
    await assertFails(setDoc(doc(db, 'classes/another-user/flashcardDecks/deck-a'), deck('new-student')))
  })
})
