import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
})

afterAll(async () => {
  await environment.cleanup()
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    // Setup class-a owned by 'owner'
    await db.doc('classes/class-a').set({ ownerId: 'owner' })
    // Active enrollments
    await db.doc('enrollments/class-a_student').set({ status: 'active' })
    await db.doc('enrollments/class-a_other-student').set({ status: 'active' })
    await db.doc('enrollments/class-a_personal-owner').set({ status: 'active' })
    // Blocked enrollment
    await db.doc('enrollments/class-a_blocked-student').set({ status: 'blocked' })

    const now = new Date()
    // Pre-populate a published class canvas
    await db.doc('classes/class-a/learningCanvases/pub-canvas').set({
      ownerId: 'owner',
      classId: 'class-a',
      kind: 'class',
      title: 'Published Canvas',
      description: 'Public description',
      status: 'published',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.doc('classes/class-a/learningCanvases/pub-canvas/content/main').set({
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    // Pre-populate a draft class canvas
    await db.doc('classes/class-a/learningCanvases/draft-canvas').set({
      ownerId: 'owner',
      classId: 'class-a',
      kind: 'class',
      title: 'Draft Canvas',
      description: '',
      status: 'draft',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.doc('classes/class-a/learningCanvases/draft-canvas/content/main').set({
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })

    // Pre-populate a personal canvas owned by personal-owner
    await db.doc('classes/class-a/learningCanvases/personal-canvas').set({
      ownerId: 'personal-owner',
      classId: 'class-a',
      kind: 'personal',
      title: 'My Private Study',
      description: '',
      status: 'private',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: now,
      updatedAt: now,
    })
    await db.doc('classes/class-a/learningCanvases/personal-canvas/content/main').set({
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    })
  })
})

describe('Learning Canvas security rules emulator matrix', () => {
  it('matrix for CLASS KIND: read, create, update, delete across all roles', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const otherInstructor = environment.authenticatedContext('other-instructor').firestore()
    const student = environment.authenticatedContext('student').firestore()
    const blockedStudent = environment.authenticatedContext('blocked-student').firestore()
    const nonMember = environment.authenticatedContext('non-member').firestore()

    // 1. Read class canvases
    // Owner reads draft and published
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/learningCanvases/pub-canvas')))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas')))
    await assertSucceeds(getDoc(doc(owner, 'classes/class-a/learningCanvases/pub-canvas/content/main')))

    // Active student reads published only; draft is hidden
    await assertSucceeds(getDoc(doc(student, 'classes/class-a/learningCanvases/pub-canvas')))
    await assertSucceeds(getDoc(doc(student, 'classes/class-a/learningCanvases/pub-canvas/content/main')))
    await assertFails(getDoc(doc(student, 'classes/class-a/learningCanvases/draft-canvas')))
    await assertFails(getDoc(doc(student, 'classes/class-a/learningCanvases/draft-canvas/content/main')))

    // Student list query must filter by status == 'published'
    await assertSucceeds(
      getDocs(
        query(
          collection(student, 'classes/class-a/learningCanvases'),
          where('kind', '==', 'class'),
          where('status', '==', 'published'),
        ),
      ),
    )
    await assertFails(getDocs(collection(student, 'classes/class-a/learningCanvases')))

    // Blocked, non-member, and other instructor cannot read published or draft
    await assertFails(getDoc(doc(blockedStudent, 'classes/class-a/learningCanvases/pub-canvas')))
    await assertFails(getDoc(doc(nonMember, 'classes/class-a/learningCanvases/pub-canvas')))
    await assertFails(getDoc(doc(otherInstructor, 'classes/class-a/learningCanvases/pub-canvas')))

    // 2. Create class canvases
    const newCanvasData = {
      ownerId: 'owner',
      classId: 'class-a',
      kind: 'class',
      title: 'New Class Canvas',
      description: '',
      status: 'draft',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await assertSucceeds(
      setDoc(doc(owner, 'classes/class-a/learningCanvases/owner-created'), newCanvasData),
    )

    // Student or other instructor cannot create class canvas
    await assertFails(
      setDoc(doc(student, 'classes/class-a/learningCanvases/student-created'), {
        ...newCanvasData,
        ownerId: 'student',
      }),
    )
    await assertFails(
      setDoc(doc(otherInstructor, 'classes/class-a/learningCanvases/other-created'), {
        ...newCanvasData,
        ownerId: 'other-instructor',
      }),
    )

    // 3. Update class canvas
    await assertSucceeds(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/owner-created'), {
        title: 'Updated Canvas Title',
        updatedAt: new Date(),
      }),
    )
    await assertFails(
      updateDoc(doc(student, 'classes/class-a/learningCanvases/pub-canvas'), {
        title: 'Tampered by student',
      }),
    )

    // 4. Delete class canvas
    await assertFails(deleteDoc(doc(student, 'classes/class-a/learningCanvases/pub-canvas')))
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/learningCanvases/owner-created')))
  })

  it('matrix for PERSONAL KIND: privacy, student isolation, class owner cascade delete', async () => {
    const owner = environment.authenticatedContext('owner').firestore()
    const personalOwner = environment.authenticatedContext('personal-owner').firestore()
    const otherStudent = environment.authenticatedContext('other-student').firestore()
    const nonMember = environment.authenticatedContext('non-member').firestore()

    // 1. Read personal canvas: only owner can read; class owner and other students CANNOT read
    await assertSucceeds(getDoc(doc(personalOwner, 'classes/class-a/learningCanvases/personal-canvas')))
    await assertSucceeds(
      getDoc(doc(personalOwner, 'classes/class-a/learningCanvases/personal-canvas/content/main')),
    )

    // Class owner CANNOT read student's personal canvas
    await assertFails(getDoc(doc(owner, 'classes/class-a/learningCanvases/personal-canvas')))
    await assertFails(
      getDoc(doc(owner, 'classes/class-a/learningCanvases/personal-canvas/content/main')),
    )

    // Other student CANNOT read personal canvas
    await assertFails(getDoc(doc(otherStudent, 'classes/class-a/learningCanvases/personal-canvas')))
    await assertFails(
      getDoc(doc(otherStudent, 'classes/class-a/learningCanvases/personal-canvas/content/main')),
    )

    // 2. Create personal canvas: requires active membership and status == 'private'
    const newPersonal = {
      ownerId: 'other-student',
      classId: 'class-a',
      kind: 'personal',
      title: 'Study Map',
      description: '',
      status: 'private',
      nodeCount: 0,
      edgeCount: 0,
      refs: [],
      sourceCanvasId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await assertSucceeds(
      setDoc(doc(otherStudent, 'classes/class-a/learningCanvases/os-canvas'), newPersonal),
    )

    // Fails if status is not 'private'
    await assertFails(
      setDoc(doc(otherStudent, 'classes/class-a/learningCanvases/os-pub-fail'), {
        ...newPersonal,
        status: 'published',
      }),
    )

    // Non-member cannot create personal canvas in class-a
    await assertFails(
      setDoc(doc(nonMember, 'classes/class-a/learningCanvases/nm-canvas'), {
        ...newPersonal,
        ownerId: 'non-member',
      }),
    )

    // 3. Update personal canvas: only personal owner can update
    await assertSucceeds(
      updateDoc(doc(personalOwner, 'classes/class-a/learningCanvases/personal-canvas'), {
        title: 'Updated My Notes',
        updatedAt: new Date(),
      }),
    )
    await assertFails(
      updateDoc(doc(otherStudent, 'classes/class-a/learningCanvases/personal-canvas'), {
        title: 'Tampered by other student',
      }),
    )
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/personal-canvas'), {
        title: 'Tampered by instructor',
      }),
    )

    // 4. Delete personal canvas:
    // Personal owner can delete
    await assertSucceeds(deleteDoc(doc(otherStudent, 'classes/class-a/learningCanvases/os-canvas')))

    // Other student cannot delete
    await assertFails(deleteDoc(doc(otherStudent, 'classes/class-a/learningCanvases/personal-canvas')))

    // Class owner CAN delete personal canvas (and its content) for class cascade cleanup
    await assertSucceeds(
      deleteDoc(doc(owner, 'classes/class-a/learningCanvases/personal-canvas/content/main')),
    )
    await assertSucceeds(deleteDoc(doc(owner, 'classes/class-a/learningCanvases/personal-canvas')))
  })

  it('enforces immutable fields on update', async () => {
    const owner = environment.authenticatedContext('owner').firestore()

    // Cannot change kind
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas'), {
        kind: 'personal',
      }),
    )

    // Cannot change ownerId
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas'), {
        ownerId: 'someone-else',
      }),
    )

    // Cannot change classId
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas'), {
        classId: 'class-b',
      }),
    )
  })

  it('enforces list size limits in rules: refs <= 80, nodes <= 80, edges <= 120', async () => {
    const owner = environment.authenticatedContext('owner').firestore()

    // 81 refs exceeds limit
    const tooManyRefs = Array.from({ length: 81 }, (_, i) => ({
      type: 'module',
      id: `m${i}`,
    }))
    await assertFails(
      updateDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas'), {
        refs: tooManyRefs,
      }),
    )

    // 81 nodes in content doc exceeds limit
    const tooManyNodes = Array.from({ length: 81 }, (_, i) => ({
      id: `n${i}`,
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: 'none',
      text: '',
    }))
    await assertFails(
      setDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas/content/main'), {
        version: 1,
        nodes: tooManyNodes,
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    )

    // 121 edges exceeds limit
    const tooManyEdges = Array.from({ length: 121 }, (_, i) => ({
      id: `e${i}`,
      from: 'a',
      to: 'b',
      arrow: 'to',
    }))
    await assertFails(
      setDoc(doc(owner, 'classes/class-a/learningCanvases/draft-canvas/content/main'), {
        version: 1,
        nodes: [],
        edges: tooManyEdges,
        viewport: { x: 0, y: 0, zoom: 1 },
      }),
    )
  })
})
