import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, type Firestore } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  copyToMyCanvases,
  createCanvas,
  deleteCanvas,
  duplicate,
  getCanvas,
  getContent,
  publish,
  rename,
  saveCanvas,
  unpublish,
} from './services'
import { deleteClassCascade } from '../classes/services/deleteClassCascade'
import type { LearningCanvasContent, LearningCanvasNode } from './types'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const dbFor = (uid: string) => environment.authenticatedContext(uid).firestore() as unknown as Firestore

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
    // Setup users
    await db.doc('users/teacher-1').set({ uid: 'teacher-1', role: 'instructor' })
    await db.doc('users/student-1').set({ uid: 'student-1', role: 'student' })

    // Setup class
    await db.doc('classes/class-test').set({
      ownerId: 'teacher-1',
      ownerName: 'Instructor',
      name: 'Biology 101',
      section: 'A',
      subject: 'Science',
      description: 'Introductory biology',
      joinCode: 'ABC234',
      joinEnabled: true,
      requireApproval: false,
      status: 'active',
      accent: 'solid',
      createdAt: new Date(),
      updatedAt: new Date(),
      codeRotatedAt: new Date(),
    })
    await db.doc('classCodes/ABC234').set({
      classId: 'class-test',
      ownerId: 'teacher-1',
      className: 'Biology 101',
      ownerName: 'Instructor',
      joinEnabled: true,
      requireApproval: false,
      archived: false,
    })
    // Student active enrollment
    await db.doc('enrollments/class-test_student-1').set({
      classId: 'class-test',
      ownerId: 'teacher-1',
      uid: 'student-1',
      studentName: 'Student One',
      studentPhotoURL: null,
      className: 'Biology 101',
      status: 'active',
      codeUsed: 'ABC234',
      joinedAt: new Date(),
      updatedAt: new Date(),
    })
  })
})

describe('Learning Canvas services', () => {
  it('creates, reads, renames, publishes, unpublishes and duplicates a canvas', async () => {
    const teacherDb = dbFor('teacher-1')

    // 1. Create canvas
    const canvasId = await createCanvas(
      'class-test',
      'teacher-1',
      {
        title: 'Cell Structure',
        description: 'Organelles overview',
        kind: 'class',
      },
      teacherDb,
    )
    expect(canvasId).toBeDefined()

    // 2. Read canvas & content
    const meta = await getCanvas('class-test', canvasId, teacherDb)
    expect(meta).not.toBeNull()
    expect(meta?.title).toBe('Cell Structure')
    expect(meta?.status).toBe('draft')

    const initialContent = await getContent('class-test', canvasId, teacherDb)
    expect(initialContent).not.toBeNull()
    expect(initialContent?.nodes).toEqual([])

    // 3. Rename
    await rename('class-test', canvasId, 'Cell Structure & Function', teacherDb)
    const renamed = await getCanvas('class-test', canvasId, teacherDb)
    expect(renamed?.title).toBe('Cell Structure & Function')

    // 4. Publish & unpublish
    await publish('class-test', canvasId, teacherDb)
    const published = await getCanvas('class-test', canvasId, teacherDb)
    expect(published?.status).toBe('published')

    await unpublish('class-test', canvasId, teacherDb)
    const unpublished = await getCanvas('class-test', canvasId, teacherDb)
    expect(unpublished?.status).toBe('draft')

    // 5. Duplicate
    const copyId = await duplicate('class-test', canvasId, 'teacher-1', teacherDb)
    expect(copyId).not.toBe(canvasId)
    const copyMeta = await getCanvas('class-test', copyId, teacherDb)
    expect(copyMeta?.title).toBe('Copy of Cell Structure & Function')
    expect(copyMeta?.sourceCanvasId).toBe(canvasId)
  })

  it('student copies published class canvas to personal canvas with isolation', async () => {
    const teacherDb = dbFor('teacher-1')
    const studentDb = dbFor('student-1')

    // Create and publish a class canvas with content
    const sampleNodes: LearningCanvasNode[] = [
      {
        id: 'c1',
        type: 'text',
        x: 10,
        y: 20,
        width: 240,
        height: 140,
        color: 'c1',
        text: 'Plant Cells vs Animal Cells',
      },
    ]
    const classCanvasId = await createCanvas(
      'class-test',
      'teacher-1',
      {
        title: 'Cellular Differences',
        kind: 'class',
        initialContent: {
          nodes: sampleNodes,
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
      teacherDb,
    )
    await publish('class-test', classCanvasId, teacherDb)

    // Student copies to personal canvases
    const personalCanvasId = await copyToMyCanvases(
      'class-test',
      classCanvasId,
      'student-1',
      studentDb,
    )
    expect(personalCanvasId).toBeDefined()
    expect(personalCanvasId).not.toBe(classCanvasId)

    // Student verifies personal canvas
    const personalMeta = await getCanvas('class-test', personalCanvasId, studentDb)
    expect(personalMeta?.kind).toBe('personal')
    expect(personalMeta?.status).toBe('private')
    expect(personalMeta?.ownerId).toBe('student-1')
    expect(personalMeta?.sourceCanvasId).toBe(classCanvasId)

    const personalContent = await getContent('class-test', personalCanvasId, studentDb)
    expect(personalContent?.nodes.length).toBe(1)
    expect(personalContent?.nodes[0]?.id).toBe('c1')

    // Teacher cannot read student's personal canvas (security enforced)
    await expect(getCanvas('class-test', personalCanvasId, teacherDb)).rejects.toThrow()
  })

  it('saves canvas with 80 nodes, updates recomputed metadata, and tests optimistic locking', async () => {
    const teacherDb = dbFor('teacher-1')

    const canvasId = await createCanvas(
      'class-test',
      'teacher-1',
      {
        title: 'Large Canvas Test',
        kind: 'class',
      },
      teacherDb,
    )

    const metaBefore = await getCanvas('class-test', canvasId, teacherDb)
    expect(metaBefore).not.toBeNull()
    const originalUpdatedAt = metaBefore!.updatedAt

    // Build 80 nodes with reference nodes
    const nodes80: LearningCanvasNode[] = Array.from({ length: 80 }, (_, i) => {
      if (i % 4 === 0) {
        return {
          id: `ref-${i}`,
          type: 'reference',
          x: (i % 10) * 120,
          y: Math.floor(i / 10) * 120,
          width: 200,
          height: 100,
          color: 'navy',
          reference: { refType: 'module', refId: `module-${i}` },
        }
      }
      return {
        id: `node-${i}`,
        type: 'text',
        x: (i % 10) * 120,
        y: Math.floor(i / 10) * 120,
        width: 200,
        height: 100,
        color: 'c3',
        text: `Concept card #${i}`,
      }
    })

    const newContent: LearningCanvasContent = {
      version: 1,
      nodes: nodes80,
      edges: [
        { id: 'edge-1', from: nodes80[0]!.id, to: nodes80[1]!.id, arrow: 'to' },
      ],
      viewport: { x: 50, y: 50, zoom: 0.8 },
    }

    // Save with correct expectedUpdatedAt
    await saveCanvas('class-test', canvasId, newContent, originalUpdatedAt, undefined, teacherDb)

    const metaAfter = await getCanvas('class-test', canvasId, teacherDb)
    expect(metaAfter?.nodeCount).toBe(80)
    expect(metaAfter?.edgeCount).toBe(1)
    expect(metaAfter?.refs.length).toBe(20) // 80 / 4 = 20 unique reference nodes

    // Optimistic locking: saving again with stale originalUpdatedAt must throw
    await expect(
      saveCanvas('class-test', canvasId, newContent, originalUpdatedAt, undefined, teacherDb),
    ).rejects.toThrow('Canvas has been modified by another session')

    // Delete single canvas
    await deleteCanvas('class-test', canvasId, teacherDb)
    const deletedMeta = await getCanvas('class-test', canvasId, teacherDb)
    expect(deletedMeta).toBeNull()
  })

  it('stress test: 10 canvases of 80 nodes each, followed by deleteClassCascade', async () => {
    const teacherDb = dbFor('teacher-1')
    const studentDb = dbFor('student-1')

    const nodes80: LearningCanvasNode[] = Array.from({ length: 80 }, (_, i) => ({
      id: `stress-node-${i}`,
      type: 'text',
      x: (i % 10) * 150,
      y: Math.floor(i / 10) * 150,
      width: 200,
      height: 100,
      color: 'none',
      text: `Stress node content ${i}`,
    }))

    const largeContent: LearningCanvasContent = {
      version: 1,
      nodes: nodes80,
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }

    // Create 7 class canvases and 3 personal student canvases
    const createdIds: string[] = []
    for (let c = 0; c < 7; c++) {
      const id = await createCanvas(
        'class-test',
        'teacher-1',
        {
          title: `Class Canvas ${c}`,
          kind: 'class',
          initialContent: largeContent,
        },
        teacherDb,
      )
      createdIds.push(id)
    }

    for (let s = 0; s < 3; s++) {
      const id = await createCanvas(
        'class-test',
        'student-1',
        {
          title: `Student Canvas ${s}`,
          kind: 'personal',
          initialContent: largeContent,
        },
        studentDb,
      )
      createdIds.push(id)
    }

    expect(createdIds.length).toBe(10)

    // Execute class cascade delete as the teacher
    await deleteClassCascade('class-test', teacherDb)

    // Verify all 10 canvases and their content documents are completely deleted
    await environment.withSecurityRulesDisabled(async (context) => {
      const admin = context.firestore()
      for (const canvasId of createdIds) {
        const canvasSnap = await getDoc(doc(admin, 'classes/class-test/learningCanvases', canvasId))
        expect(canvasSnap.exists()).toBe(false)
        const contentSnap = await getDoc(
          doc(admin, 'classes/class-test/learningCanvases', canvasId, 'content', 'main'),
        )
        expect(contentSnap.exists()).toBe(false)
      }

      // Verify class document itself is deleted
      const classSnap = await getDoc(doc(admin, 'classes/class-test'))
      expect(classSnap.exists()).toBe(false)
    })
  })
})
