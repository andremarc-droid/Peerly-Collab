import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../../firestore.rules?raw'
import { defaultQuizSettings } from '../schemas/settings'
import { createQuiz, getQuiz, publishQuiz, updateQuiz, watchOwnerQuizzes } from './quizService'
import { saveQuestionAndKey } from './questionService'
import { duplicateQuiz } from './duplicateQuiz'
import { deleteQuizCascade } from './deleteQuizCascade'
import { startAttempt, autosaveAnswers, submitAttempt } from './attemptService'
import { getQuizResult } from './resultService'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment

beforeAll(async () => { environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } }) })
afterEach(async () => environment.clearFirestore())
afterAll(async () => environment.cleanup())

function quizInput(title: string) {
  return { title, description: '', tags: ['practice'], mode: 'quiz' as const, classId: 'class1', settings: defaultQuizSettings('quiz') }
}

async function users() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'classes/class1'), { ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000), codeRotatedAt: Timestamp.fromMillis(1000) }),
      setDoc(doc(db, 'enrollments/class1_student'), { classId: 'class1', ownerId: 'teacher', uid: 'student', studentName: 'Student', studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000) }),
    ])
  })
}

describe('quiz Firestore services', () => {
  it('creates, watches, updates, validates publishing, duplicates, archives, and cascades deletion', async () => {
    await users()
    const db = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
    const quizId = await createQuiz('teacher', 'Teacher', quizInput('Algebra'), db)
    expect((await getQuiz(quizId, db))?.status).toBe('draft')
    const observed = new Promise<void>((resolve, reject) => {
      let stop: () => void = () => {}
      stop = watchOwnerQuizzes('teacher', (items) => { if (items.length) { stop(); expect(items[0].id).toBe(quizId); resolve() } }, (error) => { stop(); reject(error) }, db)
    })
    await observed
    await updateQuiz(quizId, { description: 'Practice basics' }, db)
    await expect(publishQuiz(quizId, db)).rejects.toThrow('at least one question')
    const questionId = await saveQuestionAndKey(quizId, null,
      { type: 'multiple_choice', order: 0, prompt: 'Pick', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
      { type: 'choice', correctOptionId: 'b', explanation: 'B is correct', caseSensitive: false }, db)
    expect((await getQuiz(quizId, db))?.questionCount).toBe(1)
    await publishQuiz(quizId, db)
    const copyId = await duplicateQuiz(quizId, db)
    expect((await getQuiz(copyId, db))?.title).toBe('Copy of Algebra')
    expect((await getQuiz(copyId, db))?.status).toBe('draft')
    await deleteQuizCascade(copyId, db)
    expect(await getQuiz(copyId, db)).toBeNull()
    await deleteQuizCascade(quizId, db)
    expect(await getQuiz(quizId, db)).toBeNull()
    await assertFails(getDoc(doc(db, 'quizzes', quizId, 'questions', questionId)))
  })

  it('starts one attempt, autosaves, submits with a separate visible result, then enforces attempt limits', async () => {
    await users()
    const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore
    const input = quizInput('Practice')
    input.settings.attemptsAllowed = 1
    const quizId = await createQuiz('teacher', 'Teacher', input, owner)
    await saveQuestionAndKey(quizId, null,
      { type: 'multiple_choice', order: 0, prompt: 'Pick', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] },
      { type: 'choice', correctOptionId: 'b', explanation: 'B is correct', caseSensitive: false }, owner)
    await publishQuiz(quizId, owner)
    const attemptId = await startAttempt(quizId, 'student', 'Student', student)
    await expect(startAttempt(quizId, 'student', 'Student', student)).rejects.toThrow('in progress')
    const attemptSnapshot = await getDoc(doc(student, 'quizzes', quizId, 'attempts', attemptId))
    const attemptData = attemptSnapshot.data()
    const questionOrder = attemptData?.questionOrder as string[]
    await autosaveAnswers(quizId, attemptId, { [questionOrder[0]]: 'b' }, student)
    const submitted = await submitAttempt(quizId, attemptId, 18, student)
    expect(submitted.result.score).toBe(2)
    expect((await getQuizResult(quizId, attemptId, student))?.score).toBe(2)
    await expect(startAttempt(quizId, 'student', 'Student', student)).rejects.toThrow('No attempts remain')
  })
})
