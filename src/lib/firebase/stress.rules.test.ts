import { assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import { deleteClassCascade } from '../../features/classes/services/deleteClassCascade'
import { duplicateModule } from '../../features/modules/services'
import { deleteQuizCascade } from '../../features/quizzes/services/deleteQuizCascade'
import { duplicateQuiz } from '../../features/quizzes/services/duplicateQuiz'
import { copyQuizToClass } from '../../features/classes/services/quizService'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const now = Timestamp.fromMillis(1000)

const baseSettings = {
  answerReveal: 'after_each',
  participation: { type: 'individual' },
  scoreVisibility: 'immediate',
  scoresReleased: false,
  timeLimitMinutes: null,
  attemptsAllowed: 1,
  shuffleQuestions: false,
  shuffleOptions: false,
}

function makeQuestionAndKey(index: number) {
  const typeMod = index % 4
  if (typeMod === 0) {
    return {
      question: {
        order: index,
        type: 'multiple_choice',
        prompt: `Question ${index} multiple choice`,
        points: 1,
        options: [
          { id: 'opt_a', text: 'Option A' },
          { id: 'opt_b', text: 'Option B' },
        ],
      },
      key: {
        type: 'choice',
        correctOptionId: 'opt_a',
        explanation: `Explanation ${index}`,
        caseSensitive: false,
      },
    }
  } else if (typeMod === 1) {
    return {
      question: {
        order: index,
        type: 'true_false',
        prompt: `Question ${index} true or false`,
        points: 1,
        options: [
          { id: 'opt_true', text: 'True' },
          { id: 'opt_false', text: 'False' },
        ],
      },
      key: {
        type: 'choice',
        correctOptionId: 'opt_true',
        explanation: `Explanation ${index}`,
        caseSensitive: false,
      },
    }
  } else if (typeMod === 2) {
    return {
      question: {
        order: index,
        type: 'identification',
        prompt: `Question ${index} identification`,
        points: 2,
      },
      key: {
        type: 'identification',
        acceptedAnswers: [`answer_${index}`],
        explanation: `Explanation ${index}`,
        caseSensitive: false,
      },
    }
  } else {
    return {
      question: {
        order: index,
        type: 'flashcard',
        prompt: `Question ${index} flashcard`,
        points: 1,
      },
      key: {
        type: 'flashcard',
        back: `Back of card ${index}`,
        explanation: `Explanation ${index}`,
        caseSensitive: false,
      },
    }
  }
}

async function seedClass(db: any, classId = 'class1', ownerId = 'teacher') {
  await setDoc(doc(db, 'users', ownerId), { uid: ownerId, role: 'instructor' })
  await setDoc(doc(db, 'classes', classId), {
    ownerId,
    ownerName: 'Teacher',
    name: 'Stress Test Class',
    section: 'A',
    subject: 'CS',
    description: 'Testing high volume',
    joinCode: 'STR234',
    joinEnabled: true,
    requireApproval: false,
    status: 'active',
    accent: 'pinstripe',
    createdAt: now,
    updatedAt: now,
    codeRotatedAt: now,
  })
  await setDoc(doc(db, 'classCodes', 'STR234'), {
    classId,
    ownerId,
    className: 'Stress Test Class',
    ownerName: 'Teacher',
    joinEnabled: true,
    requireApproval: false,
    archived: false,
  })
}

async function seedQuizWithQuestions(db: any, quizId: string, count: number, classId = 'class1', ownerId = 'teacher') {
  await setDoc(doc(db, 'quizzes', quizId), {
    ownerId,
    ownerName: 'Teacher',
    classId,
    title: `Quiz ${count} Qs`,
    description: 'Stress test quiz',
    tags: [],
    mode: 'quiz',
    status: 'published',
    questionCount: count,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    settings: baseSettings,
  })

  let batch = writeBatch(db)
  let countInBatch = 0
  for (let i = 0; i < count; i++) {
    const { question, key } = makeQuestionAndKey(i)
    const qId = `q_${i}`
    batch.set(doc(db, 'quizzes', quizId, 'questions', qId), question)
    batch.set(doc(db, 'quizzes', quizId, 'answerKeys', qId), key)
    countInBatch += 2
    if (countInBatch >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      countInBatch = 0
    }
  }
  if (countInBatch > 0) {
    await batch.commit()
  }
}

async function seedCanvasQuiz(db: any, quizId: string, classId = 'class1', ownerId = 'teacher') {
  await setDoc(doc(db, 'quizzes', quizId), {
    ownerId,
    ownerName: 'Teacher',
    classId,
    title: 'Canvas Circuit',
    description: 'Canvas quiz test',
    tags: [],
    mode: 'canvas',
    status: 'published',
    questionCount: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: now,
    settings: baseSettings,
  })
  await setDoc(doc(db, 'quizzes', quizId, 'questions', 'board'), {
    order: 0,
    type: 'canvas',
    prompt: 'Connect concept A to concept B',
    points: 100,
    layoutMode: 'scattered',
    directed: true,
    wrongPenalty: 'half',
    cards: [
      { id: 'c0', type: 'note', content: 'Concept A', position: { x: 0, y: 0 } },
      { id: 'c1', type: 'note', content: 'Concept B', position: { x: 100, y: 100 } },
    ],
  })
  await setDoc(doc(db, 'quizzes', quizId, 'answerKeys', 'board'), {
    type: 'canvas',
    explanation: 'Wiring guide',
    connections: [
      { id: 'k0', from: 'c0', to: 'c1', points: 1 },
    ],
  })
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: 8180, rules },
  })
}, 30_000)

afterEach(async () => {
  await environment?.clearFirestore()
})

afterAll(async () => {
  await environment?.cleanup()
})

describe('stress tests: duplicateQuiz, duplicateModule, delete cascades', () => {
  describe('duplicateQuiz stress testing', () => {
    it('duplicateQuiz with 5 questions (mixed types) succeeds as draft with matching questionCount, questions, answer keys, and mode', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await seedQuizWithQuestions(db, 'qz-5', 5)
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const copyId = await duplicateQuiz('qz-5', owner)

      const copySnap = await getDoc(doc(owner, 'quizzes', copyId))
      expect(copySnap.exists()).toBe(true)
      const copyData = copySnap.data()!
      expect(copyData.status).toBe('draft')
      expect(copyData.questionCount).toBe(5)
      expect(copyData.mode).toBe('quiz')
      expect(copyData.title).toBe('Copy of Quiz 5 Qs')

      const questionsSnap = await getDocs(collection(owner, 'quizzes', copyId, 'questions'))
      expect(questionsSnap.size).toBe(5)

      const keysSnap = await getDocs(collection(owner, 'quizzes', copyId, 'answerKeys'))
      expect(keysSnap.size).toBe(5)

      for (const qDoc of questionsSnap.docs) {
        const keyDoc = keysSnap.docs.find((k) => k.id === qDoc.id)
        expect(keyDoc).toBeDefined()
      }
    })

    it('duplicateQuiz with 30 questions (mixed types) succeeds as draft with matching questionCount, questions, answer keys, and mode', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await seedQuizWithQuestions(db, 'qz-30', 30)
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const copyId = await duplicateQuiz('qz-30', owner)

      const copySnap = await getDoc(doc(owner, 'quizzes', copyId))
      expect(copySnap.exists()).toBe(true)
      const copyData = copySnap.data()!
      expect(copyData.status).toBe('draft')
      expect(copyData.questionCount).toBe(30)
      expect(copyData.mode).toBe('quiz')
      expect(copyData.title).toBe('Copy of Quiz 30 Qs')

      const questionsSnap = await getDocs(collection(owner, 'quizzes', copyId, 'questions'))
      expect(questionsSnap.size).toBe(30)

      const keysSnap = await getDocs(collection(owner, 'quizzes', copyId, 'answerKeys'))
      expect(keysSnap.size).toBe(30)

      for (const qDoc of questionsSnap.docs) {
        const keyDoc = keysSnap.docs.find((k) => k.id === qDoc.id)
        expect(keyDoc).toBeDefined()
      }
    })

    it('duplicateQuiz with 100 questions (mixed types) succeeds as draft with matching questionCount, questions, answer keys, and mode', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await seedQuizWithQuestions(db, 'qz-100', 100)
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const copyId = await duplicateQuiz('qz-100', owner)

      const copySnap = await getDoc(doc(owner, 'quizzes', copyId))
      expect(copySnap.exists()).toBe(true)
      const copyData = copySnap.data()!
      expect(copyData.status).toBe('draft')
      expect(copyData.questionCount).toBe(100)
      expect(copyData.mode).toBe('quiz')
      expect(copyData.title).toBe('Copy of Quiz 100 Qs')

      const questionsSnap = await getDocs(collection(owner, 'quizzes', copyId, 'questions'))
      expect(questionsSnap.size).toBe(100)

      const keysSnap = await getDocs(collection(owner, 'quizzes', copyId, 'answerKeys'))
      expect(keysSnap.size).toBe(100)

      for (const qDoc of questionsSnap.docs) {
        const keyDoc = keysSnap.docs.find((k) => k.id === qDoc.id)
        expect(keyDoc).toBeDefined()
      }
    })

    it('duplicateQuiz with a canvas quiz succeeds as draft with matching questionCount, questions, answer keys, and mode', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await seedCanvasQuiz(db, 'cv-1')
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const copyId = await duplicateQuiz('cv-1', owner)

      const copySnap = await getDoc(doc(owner, 'quizzes', copyId))
      expect(copySnap.exists()).toBe(true)
      const copyData = copySnap.data()!
      expect(copyData.status).toBe('draft')
      expect(copyData.questionCount).toBe(1)
      expect(copyData.mode).toBe('canvas')
      expect(copyData.title).toBe('Copy of Canvas Circuit')

      const questionsSnap = await getDocs(collection(owner, 'quizzes', copyId, 'questions'))
      expect(questionsSnap.size).toBe(1)
      expect(questionsSnap.docs[0].id).toBe('board')
      expect(questionsSnap.docs[0].data().type).toBe('canvas')

      const keysSnap = await getDocs(collection(owner, 'quizzes', copyId, 'answerKeys'))
      expect(keysSnap.size).toBe(1)
      expect(keysSnap.docs[0].id).toBe('board')
      expect(keysSnap.docs[0].data().type).toBe('canvas')
    })
  })

  describe('duplicateModule and batch resource stress testing', () => {
    it('duplicateModule with maximum 10 resources succeeds', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await setDoc(doc(db, 'classes/class1/modules/mod-max'), {
          ownerId: 'teacher',
          title: 'Module with 10 resources',
          description: 'Testing max resources',
          order: 0,
          status: 'published',
          quizIds: [],
          resourceCount: 10,
          createdAt: now,
          updatedAt: now,
          publishedAt: now,
        })

        const resourceTemplates = [
          { type: 'text', title: 'R0 Notes', body: 'Notes 0' },
          { type: 'link', title: 'R1 Link', url: 'https://example.com/1' },
          { type: 'drive', title: 'R2 Drive', url: 'https://drive.google.com/file/d/123/view', driveFileId: '123', driveKind: 'file' },
          { type: 'youtube', title: 'R3 Video', url: 'https://www.youtube.com/watch?v=abc12345678', youtubeVideoId: 'abc12345678' },
          { type: 'text', title: 'R4 Text', body: 'Notes 4' },
          { type: 'link', title: 'R5 Link', url: 'https://example.com/5' },
          { type: 'drive', title: 'R6 Doc', url: 'https://docs.google.com/document/d/456/edit', driveFileId: '456', driveKind: 'doc' },
          { type: 'youtube', title: 'R7 Video', url: 'https://youtu.be/def12345678', youtubeVideoId: 'def12345678' },
          { type: 'text', title: 'R8 Text', body: 'Notes 8' },
          { type: 'link', title: 'R9 Link', url: 'https://example.com/9' },
        ]

        for (let i = 0; i < 10; i++) {
          await setDoc(doc(db, 'classes/class1/modules/mod-max/resources', `res_${i}`), {
            ...resourceTemplates[i],
            order: i,
            createdAt: now,
            updatedAt: now,
          })
        }
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const copyId = await duplicateModule('class1', 'mod-max', owner)

      const copySnap = await getDoc(doc(owner, 'classes/class1/modules', copyId))
      expect(copySnap.exists()).toBe(true)
      const copyData = copySnap.data()!
      expect(copyData.status).toBe('draft')
      expect(copyData.resourceCount).toBe(10)
      expect(copyData.title).toBe('Copy of Module with 10 resources')

      const resourcesSnap = await getDocs(collection(owner, 'classes/class1/modules', copyId, 'resources'))
      expect(resourcesSnap.size).toBe(10)
    })

    it('adding 3 resources to a module that has 2 in one batch succeeds', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await setDoc(doc(db, 'classes/class1/modules/mod-2'), {
          ownerId: 'teacher',
          title: 'Module with 2 resources',
          description: '',
          order: 0,
          status: 'draft',
          quizIds: [],
          resourceCount: 2,
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
        })
        await setDoc(doc(db, 'classes/class1/modules/mod-2/resources/r0'), {
          type: 'text',
          title: 'Initial R0',
          body: 'Text 0',
          order: 0,
          createdAt: now,
          updatedAt: now,
        })
        await setDoc(doc(db, 'classes/class1/modules/mod-2/resources/r1'), {
          type: 'link',
          title: 'Initial R1',
          url: 'https://example.com/init',
          order: 1,
          createdAt: now,
          updatedAt: now,
        })
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      const batch = writeBatch(owner)
      const modRef = doc(owner, 'classes/class1/modules/mod-2')

      batch.update(modRef, {
        resourceCount: 5,
        updatedAt: now,
      })
      batch.set(doc(owner, 'classes/class1/modules/mod-2/resources/r2'), {
        type: 'text',
        title: 'Added R2',
        body: 'Notes 2',
        order: 2,
        createdAt: now,
        updatedAt: now,
      })
      batch.set(doc(owner, 'classes/class1/modules/mod-2/resources/r3'), {
        type: 'link',
        title: 'Added R3',
        url: 'https://example.com/r3',
        order: 3,
        createdAt: now,
        updatedAt: now,
      })
      batch.set(doc(owner, 'classes/class1/modules/mod-2/resources/r4'), {
        type: 'drive',
        title: 'Added R4',
        url: 'https://drive.google.com/file/d/drive4/view',
        driveFileId: 'drive4',
        driveKind: 'file',
        order: 4,
        createdAt: now,
        updatedAt: now,
      })

      await assertSucceeds(batch.commit())

      const modSnap = await getDoc(modRef)
      expect(modSnap.data()?.resourceCount).toBe(5)

      const resourcesSnap = await getDocs(collection(owner, 'classes/class1/modules/mod-2/resources'))
      expect(resourcesSnap.size).toBe(5)
    })
  })

  describe('delete cascades on high question counts', () => {
    it('deleteQuizCascade succeeds on a quiz that has 100 questions', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await seedClass(db)
        await seedQuizWithQuestions(db, 'qz-to-delete', 100)
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      await deleteQuizCascade('qz-to-delete', owner)

      await environment.withSecurityRulesDisabled(async (context) => {
        const admin = context.firestore()
        const quizSnap = await getDoc(doc(admin, 'quizzes', 'qz-to-delete'))
        expect(quizSnap.exists()).toBe(false)

        const questionsSnap = await getDocs(collection(admin, 'quizzes', 'qz-to-delete', 'questions'))
        expect(questionsSnap.empty).toBe(true)

        const keysSnap = await getDocs(collection(admin, 'quizzes', 'qz-to-delete', 'answerKeys'))
        expect(keysSnap.empty).toBe(true)
      })
    })

    it('deleteClassCascade succeeds on a class with a quiz that has 100 questions', async () => {
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await setDoc(doc(db, 'users', 'teacher'), { uid: 'teacher', role: 'instructor' })
        await setDoc(doc(db, 'users', 'student1'), { uid: 'student1', role: 'student' })
        await setDoc(doc(db, 'classes', 'class-cascade'), {
          ownerId: 'teacher',
          ownerName: 'Teacher',
          name: 'Cascade Class',
          section: 'B',
          subject: 'Math',
          description: '',
          joinCode: 'CASC23',
          joinEnabled: true,
          requireApproval: false,
          status: 'active',
          accent: 'pinstripe',
          createdAt: now,
          updatedAt: now,
          codeRotatedAt: now,
        })
        await setDoc(doc(db, 'classCodes', 'CASC23'), {
          classId: 'class-cascade',
          ownerId: 'teacher',
          className: 'Cascade Class',
          ownerName: 'Teacher',
          joinEnabled: true,
          requireApproval: false,
          archived: false,
        })
        await setDoc(doc(db, 'enrollments', 'class-cascade_student1'), {
          classId: 'class-cascade',
          ownerId: 'teacher',
          uid: 'student1',
          studentName: 'Student 1',
          studentPhotoURL: null,
          className: 'Cascade Class',
          status: 'active',
          codeUsed: 'CASC23',
          joinedAt: now,
          updatedAt: now,
        })
        await setDoc(doc(db, 'classes/class-cascade/modules/mod-casc'), {
          ownerId: 'teacher',
          title: 'Module in cascade',
          description: '',
          order: 0,
          status: 'draft',
          quizIds: [],
          resourceCount: 1,
          createdAt: now,
          updatedAt: now,
          publishedAt: null,
        })
        await setDoc(doc(db, 'classes/class-cascade/modules/mod-casc/resources/r1'), {
          type: 'text',
          title: 'Res 1',
          body: 'Note',
          order: 0,
          createdAt: now,
          updatedAt: now,
        })

        await seedQuizWithQuestions(db, 'qz-casc-100', 100, 'class-cascade')
      })

      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
      await deleteClassCascade('class-cascade', owner)

      await environment.withSecurityRulesDisabled(async (context) => {
        const admin = context.firestore()
        const classSnap = await getDoc(doc(admin, 'classes', 'class-cascade'))
        expect(classSnap.exists()).toBe(false)

        const codeSnap = await getDoc(doc(admin, 'classCodes', 'CASC23'))
        expect(codeSnap.exists()).toBe(false)

        const quizSnap = await getDoc(doc(admin, 'quizzes', 'qz-casc-100'))
        expect(quizSnap.exists()).toBe(false)

        const questionsSnap = await getDocs(collection(admin, 'quizzes', 'qz-casc-100', 'questions'))
        expect(questionsSnap.empty).toBe(true)

        const keysSnap = await getDocs(collection(admin, 'quizzes', 'qz-casc-100', 'answerKeys'))
        expect(keysSnap.empty).toBe(true)
      })
    })

    it('duplicates, copies to another class, and cascades delete for a canvas with 12 max-size images (~350 KB each)', async () => {
      const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore

      // 1. Seed two active classes
      await environment.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' })
        await setDoc(doc(db, 'classes/class-c1'), {
          ownerId: 'teacher', ownerName: 'Teacher', name: 'Class 1', section: '', subject: '',
          description: '', joinCode: 'CNVS23', joinEnabled: true, requireApproval: false,
          status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
        })
        await setDoc(doc(db, 'classes/class-c2'), {
          ownerId: 'teacher', ownerName: 'Teacher', name: 'Class 2', section: '', subject: '',
          description: '', joinCode: 'CNVS24', joinEnabled: true, requireApproval: false,
          status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now,
        })

        // 2. Seed canvas quiz with 12 image cards and board question
        const canvasSettings = {
          ...baseSettings,
          shuffleQuestions: false,
          shuffleOptions: false,
        }
        await setDoc(doc(db, 'quizzes/qz-canvas-12'), {
          ownerId: 'teacher', ownerName: 'Teacher', classId: 'class-c1', title: 'Cell Biology Canvas',
          description: '', tags: [], mode: 'canvas', status: 'draft', questionCount: 1,
          createdAt: now, updatedAt: now, publishedAt: null, settings: canvasSettings,
        })

        const cards = []
        const connections = []
        // ~350,000 characters payload for each image
        const base64Chunk = 'A'.repeat(350000)

        for (let i = 0; i < 12; i += 1) {
          const imgId = `img-orig-${i}`
          cards.push({
            id: `card-${i}`,
            type: 'image',
            title: `Organelle ${i}`,
            content: `Description ${i}`,
            imageId: imgId,
            alt: `Alt description for organelle ${i}`,
            position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 120 },
          })
          if (i > 0) {
            connections.push({
              id: `card-${i - 1}->card-${i}`,
              from: `card-${i - 1}`,
              to: `card-${i}`,
              points: 1,
            })
          }

          // Write 12 images of ~350 KB
          await setDoc(doc(db, 'quizzes/qz-canvas-12/images', imgId), {
            data: base64Chunk,
            mimeType: 'image/jpeg',
            width: 1024,
            height: 768,
            bytes: Math.floor((350000 * 3) / 4),
            createdAt: now,
          })
        }

        await setDoc(doc(db, 'quizzes/qz-canvas-12/questions/board'), {
          order: 0,
          type: 'canvas',
          prompt: 'Connect the cell organelles',
          points: 100,
          layoutMode: 'scattered',
          directed: true,
          wrongPenalty: 'half',
          cards,
        })

        await setDoc(doc(db, 'quizzes/qz-canvas-12/answerKeys/board'), {
          type: 'canvas',
          explanation: 'Standard cell biology connections',
          connections,
        })
      })

      // 3. Test duplicateQuiz with 12 x 350KB images
      const duplicatedId = await duplicateQuiz('qz-canvas-12', owner)
      expect(duplicatedId).toBeTruthy()

      // Verify copied images and remapped cards in the duplicate
      await environment.withSecurityRulesDisabled(async (context) => {
        const admin = context.firestore()
        const dupImages = await getDocs(collection(admin, 'quizzes', duplicatedId, 'images'))
        expect(dupImages.size).toBe(12)

        const dupBoardSnap = await getDoc(doc(admin, 'quizzes', duplicatedId, 'questions', 'board'))
        expect(dupBoardSnap.exists()).toBe(true)
        const dupBoardData = dupBoardSnap.data()
        expect(dupBoardData?.cards?.length).toBe(12)

        // Ensure all card imageIds were remapped to the newly created image IDs
        const dupImageIds = new Set(dupImages.docs.map((d) => d.id))
        for (const card of dupBoardData?.cards ?? []) {
          expect(card.type).toBe('image')
          expect(dupImageIds.has(card.imageId)).toBe(true)
          expect(card.imageId).not.toMatch(/^img-orig-/)
        }
      })

      // 4. Test copyQuizToClass to another class
      const copiedToClassId = await copyQuizToClass('qz-canvas-12', 'class-c2', owner)
      expect(copiedToClassId).toBeTruthy()

      await environment.withSecurityRulesDisabled(async (context) => {
        const admin = context.firestore()
        const copiedQuizSnap = await getDoc(doc(admin, 'quizzes', copiedToClassId))
        expect(copiedQuizSnap.data()?.classId).toBe('class-c2')

        const copiedImages = await getDocs(collection(admin, 'quizzes', copiedToClassId, 'images'))
        expect(copiedImages.size).toBe(12)
      })

      // 5. Test deleteQuizCascade deletes all 12 images and quiz artifacts
      await deleteQuizCascade(duplicatedId, owner)

      await environment.withSecurityRulesDisabled(async (context) => {
        const admin = context.firestore()
        const remainingImages = await getDocs(collection(admin, 'quizzes', duplicatedId, 'images'))
        expect(remainingImages.empty).toBe(true)

        const remainingBoard = await getDoc(doc(admin, 'quizzes', duplicatedId, 'questions', 'board'))
        expect(remainingBoard.exists()).toBe(false)

        const remainingQuiz = await getDoc(doc(admin, 'quizzes', duplicatedId))
        expect(remainingQuiz.exists()).toBe(false)
      })
    })
  })
})
