import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { serverTimestamp, Timestamp, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import { isLate } from '../../features/quizzes/results/resultLogic'
import { listResults } from '../../features/quizzes/services/resultService'
import { duplicateQuiz } from '../../features/quizzes/services/duplicateQuiz'
import { autosaveAnswers, startAttempt, submitAttempt } from '../../features/quizzes/services/attemptService'
import { saveQuestionAndKey } from '../../features/quizzes/services/questionService'
import { gradeCanvasQuestion } from '../../features/quizzes/grading/grade'
import type { CanvasAnswerKey, CanvasQuestion } from '../../features/canvas/types'

const projectId = 'demo-peerly-collab'
let environment: RulesTestEnvironment
const now = Timestamp.fromMillis(1000)
const settings = {
  answerReveal: 'after_each', participation: { type: 'individual' }, scoreVisibility: 'immediate', scoresReleased: false,
  timeLimitMinutes: null, attemptsAllowed: 1, shuffleQuestions: false, shuffleOptions: false,
}
const quizData = (ownerId = 'teacher', status = 'published') => ({
  ownerId, ownerName: 'Teacher', classId: 'class1', title: 'Algebra practice', description: '', tags: [], mode: 'quiz', status,
  questionCount: 1, createdAt: now, updatedAt: now, publishedAt: status === 'published' ? now : null, settings,
})
const question = { order: 0, type: 'multiple_choice', prompt: 'Pick', points: 2, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }
const key = { type: 'choice', correctOptionId: 'b', explanation: 'Because.', caseSensitive: false }
const attempt = (userId = 'student', status = 'in_progress', overrides: Record<string, unknown> = {}) => ({
  userId, userName: 'Student', attemptNumber: 1, status, answers: {}, questionOrder: ['q'], optionOrder: { q: ['a', 'b'] },
  startedAt: serverTimestamp(), submittedAt: status === 'submitted' ? now : null, timeSpentSeconds: status === 'submitted' ? 4 : 0,
  ...overrides,
})
const participant = (uid = 'student', activeAttemptId: string | null = 'att') => ({
  userId: uid, userName: 'Student', createdAt: now, updatedAt: now, attemptCount: 1, activeAttemptId,
})
const result = (userId = 'student') => ({ userId, score: 2, maxScore: 2, perQuestion: { q: { correct: true, pointsAwarded: 2, overridden: false } }, gradedAt: now })

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } })
}, 30_000)
afterEach(async () => environment?.clearFirestore())
afterAll(async () => { await environment?.cleanup() })

async function seed(data: { status?: string; visibility?: string } = {}) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'users/teacher'), { uid: 'teacher', role: 'instructor' }),
      setDoc(doc(db, 'users/otherTeacher'), { uid: 'otherTeacher', role: 'instructor' }),
      setDoc(doc(db, 'users/student'), { uid: 'student', role: 'student' }),
      setDoc(doc(db, 'users/other'), { uid: 'other', role: 'student' }),
      setDoc(doc(db, 'classes/class1'), { ownerId: 'teacher', ownerName: 'Teacher', name: 'Math', section: '', subject: '', description: '', joinCode: 'ABC234', joinEnabled: true, requireApproval: false, status: 'active', accent: 'pinstripe', createdAt: now, updatedAt: now, codeRotatedAt: now }),
      setDoc(doc(db, 'enrollments/class1_student'), { classId: 'class1', ownerId: 'teacher', uid: 'student', studentName: 'Student', studentPhotoURL: null, className: 'Math', status: 'active', codeUsed: 'ABC234', joinedAt: now, updatedAt: now }),
      setDoc(doc(db, 'quizzes/qz'), { ...quizData('teacher', data.status ?? 'published'), settings: { ...settings, scoreVisibility: data.visibility ?? 'immediate' } }),
      setDoc(doc(db, 'quizzes/qz/questions/q'), question),
      setDoc(doc(db, 'quizzes/qz/answerKeys/q'), key),
    ])
  })
}

describe('quiz Firestore rules', () => {
  it('denies signed-out reads and writes and denies unknown collections', async () => {
    const db = environment.unauthenticatedContext().firestore()
    await seed()
    await assertFails(getDoc(doc(db, 'quizzes/qz')))
    await assertFails(setDoc(doc(db, 'quizzes/new'), quizData('student', 'draft')))
    await assertFails(getDoc(doc(db, 'unlisted/x')))
  })

  it('allows instructor-owned quiz operations and rejects another owner and non-instructor creates', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz')))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz'), { title: 'Updated title', updatedAt: now }))
    await assertFails(updateDoc(doc(owner, 'quizzes/qz'), { ownerId: 'student' }))
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/draft'), quizData('teacher', 'draft')))
    await assertFails(getDoc(doc(student, 'quizzes/draft')))
    await assertFails(setDoc(doc(student, 'quizzes/new'), quizData('student', 'draft')))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/new'), { ...quizData('teacher', 'draft'), questionCount: 0, publishedAt: null }))
    await assertFails(setDoc(doc(owner, 'quizzes/bad'), { ...quizData('teacher', 'draft'), mode: 'bad' }))
  })

  it('allows published catalog and question reads but only the owner can write questions', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz')))
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz/questions/q')))
    await assertSucceeds(getDocs(collection(student, 'quizzes/qz/questions')))
    await assertFails(getDoc(doc(environment.authenticatedContext('other').firestore(), 'quizzes/qz')))
    await assertFails(getDocs(collection(environment.authenticatedContext('other').firestore(), 'quizzes/qz/questions')))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/questions/q'), { prompt: 'Tampered' }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/questions/q'), { prompt: 'Updated' }))
    await assertFails(setDoc(doc(owner, 'quizzes/qz/questions/bad'), { ...question, answer: 'b' }))
  })

  it('requires active class membership in the published class quiz list query', async () => {
    await seed()
    const member = environment.authenticatedContext('student').firestore()
    const outsider = environment.authenticatedContext('other').firestore()
    await assertSucceeds(getDocs(query(collection(member, 'quizzes'), where('classId', '==', 'class1'), where('status', '==', 'published'))))
    await assertFails(getDocs(query(collection(outsider, 'quizzes'), where('classId', '==', 'class1'), where('status', '==', 'published'))))
  })

  it('restricts answer keys to owners and participants in published quizzes', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertFails(getDoc(doc(student, 'quizzes/qz/answerKeys/q')))
    const batch = writeBatch(student)
    batch.set(doc(student, 'quizzes/qz/attempts/att'), attempt())
    batch.set(doc(student, 'quizzes/qz/participants/student'), participant())
    await assertSucceeds(batch.commit())
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz/answerKeys/q')))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/answerKeys/q'), { explanation: 'Updated.' }))
    await assertFails(setDoc(doc(owner, 'quizzes/qz/answerKeys/bad'), { ...key, acceptedAnswers: ['b'] }))
  })

  it('allows students to create their own participants only for published quizzes', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const studentBatch = writeBatch(student)
    studentBatch.set(doc(student, 'quizzes/qz/attempts/att'), attempt())
    studentBatch.set(doc(student, 'quizzes/qz/participants/student'), participant())
    await assertSucceeds(studentBatch.commit())
    await assertFails(setDoc(doc(student, 'quizzes/qz/participants/other'), participant('other')))
    await assertFails(setDoc(doc(environment.authenticatedContext('other').firestore(), 'quizzes/qz/participants/other'), participant('other')))
    await environment.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), 'quizzes/qz2'), quizData('teacher', 'draft')))
    const draftBatch = writeBatch(student)
    draftBatch.set(doc(student, 'quizzes/qz2/attempts/att'), attempt())
    draftBatch.set(doc(student, 'quizzes/qz2/participants/student'), participant())
    await assertFails(draftBatch.commit())
  })

  it('restricts attempts to published student quizzes, owned records, and one-way submission', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()
    const other = environment.authenticatedContext('other').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    const attemptRef = doc(student, 'quizzes/qz/attempts/att')
    const participantRef = doc(student, 'quizzes/qz/participants/student')
    const batch = writeBatch(student)
    batch.set(attemptRef, attempt())
    batch.set(participantRef, participant())
    await assertSucceeds(batch.commit())
    await assertSucceeds(getDoc(attemptRef))
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz/attempts/att')))
    await assertFails(getDoc(doc(other, 'quizzes/qz/attempts/att')))
    await assertFails(updateDoc(doc(other, 'quizzes/qz/attempts/att'), { answers: { q: 'a' } }))
    await assertFails(updateDoc(attemptRef, { userId: 'other' }))
    const submit = writeBatch(student)
    submit.update(attemptRef, { status: 'submitted', submittedAt: serverTimestamp(), timeSpentSeconds: 4 })
    submit.update(participantRef, { activeAttemptId: null, updatedAt: serverTimestamp() })
    submit.set(doc(student, 'quizzes/qz/results/att'), result())
    await assertSucceeds(submit.commit())
    await assertFails(updateDoc(attemptRef, { answers: { q: 'b' } }))
  })

  it('enforces results visibility and makes student results immutable', async () => {
    await seed({ visibility: 'hidden' })
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/attempts/att'), attempt('student', 'submitted'))
      await setDoc(doc(db, 'quizzes/qz/results/att'), result())
    })
    const student = environment.authenticatedContext('student').firestore()
    const owner = environment.authenticatedContext('teacher').firestore()
    await assertFails(getDoc(doc(student, 'quizzes/qz/results/att')))
    await assertSucceeds(getDoc(doc(owner, 'quizzes/qz/results/att')))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/results/att'), { score: 0 }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/results/att'), { score: 1 }))
    await assertFails(setDoc(doc(student, 'quizzes/qz/results/fake'), result()))
    await assertFails(setDoc(doc(student, 'quizzes/qz/results/other-att'), result('other')))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/results/att'), { score: 1 }))
    await assertFails(updateDoc(doc(environment.authenticatedContext('otherTeacher').firestore(), 'quizzes/qz/results/att'), { score: 1 }))
  })

  it('allows only the quiz owner to apply result overrides', async () => {
    await seed()
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/attempts/att'), attempt('student', 'submitted'))
      await setDoc(doc(db, 'quizzes/qz/results/att'), result())
    })
    const owner = environment.authenticatedContext('teacher').firestore()
    const otherInstructor = environment.authenticatedContext('otherTeacher').firestore()
    const student = environment.authenticatedContext('student').firestore()
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz/results/att'), { score: 1, perQuestion: { q: { correct: false, pointsAwarded: 1, overridden: true } } }))
    await assertFails(updateDoc(doc(otherInstructor, 'quizzes/qz/results/att'), { score: 1 }))
    await assertFails(updateDoc(doc(student, 'quizzes/qz/results/att'), { score: 1 }))
    await assertFails(setDoc(doc(student, 'quizzes/qz/results/other-att'), result('other')))
  })

  it('allows scores after release and denies student score reads before release', async () => {
    await seed({ visibility: 'after_release' })
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/results/att'), result())
    })
    const student = environment.authenticatedContext('student').firestore()
    await assertFails(getDoc(doc(student, 'quizzes/qz/results/att')))
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/qz'), { settings: { ...settings, scoreVisibility: 'after_release', scoresReleased: true } })
    })
    await assertSucceeds(getDoc(doc(student, 'quizzes/qz/results/att')))
  })

  it('allows the quiz owner to list results and prevents students from listing results or another student’s results', async () => {
    await seed({ visibility: 'immediate' })
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/attempts/att-student'), attempt('student', 'submitted'))
      await setDoc(doc(db, 'quizzes/qz/results/att-student'), result('student'))
      await setDoc(doc(db, 'quizzes/qz/attempts/att-other'), attempt('other', 'submitted'))
      await setDoc(doc(db, 'quizzes/qz/results/att-other'), result('other'))
    })

    const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore

    // 1. Owner can list all results for the quiz using listResults
    const ownerResults = await assertSucceeds(listResults('qz', owner))
    expect(ownerResults).toHaveLength(2)

    // 2. Student cannot list results for the quiz using listResults
    await assertFails(listResults('qz', student))

    // 3. Student cannot list another student's results
    await assertFails(getDocs(query(collection(student, 'quizzes/qz/results'), where('userId', '==', 'other'))))

    // 4. Student can list only their own results
    const studentResults = await assertSucceeds(getDocs(query(collection(student, 'quizzes/qz/results'), where('userId', '==', 'student'))))
    expect(studentResults.docs).toHaveLength(1)
    expect(studentResults.docs[0].id).toBe('att-student')
  })

  it('enforces attempt limits and synchronizes attemptNumber with participant attemptCount', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()

    // Setup an initial completed attempt for student with attemptsAllowed = 1
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz/participants/student'), {
        userId: 'student', userName: 'Student', createdAt: now, updatedAt: now, attemptCount: 1, activeAttemptId: null,
      })
      await setDoc(doc(db, 'quizzes/qz/attempts/att-1'), attempt('student', 'submitted', { attemptNumber: 1, startedAt: now }))
      await setDoc(doc(db, 'quizzes/qz/results/att-1'), result())
    })

    // 1. Direct write starting a second attempt with attemptsAllowed = 1 is denied
    const secondAttemptBatch = writeBatch(student)
    secondAttemptBatch.update(doc(student, 'quizzes/qz/participants/student'), {
      activeAttemptId: 'att-2', attemptCount: 2, updatedAt: now,
    })
    secondAttemptBatch.set(doc(student, 'quizzes/qz/attempts/att-2'), attempt('student', 'in_progress', { attemptNumber: 2 }))
    await assertFails(secondAttemptBatch.commit())

    // 2. attemptsAllowed: null allows starting a second attempt
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/qz'), { 'settings.attemptsAllowed': null })
    })

    const allowedBatch = writeBatch(student)
    allowedBatch.update(doc(student, 'quizzes/qz/participants/student'), {
      activeAttemptId: 'att-2', attemptCount: 2, updatedAt: now,
    })
    allowedBatch.set(doc(student, 'quizzes/qz/attempts/att-2'), attempt('student', 'in_progress', { attemptNumber: 2 }))
    await assertSucceeds(allowedBatch.commit())

    // 3. Attempt creation where attemptNumber does not match participant's attemptCount is denied
    const mismatchBatch = writeBatch(student)
    mismatchBatch.update(doc(student, 'quizzes/qz/participants/student'), {
      activeAttemptId: 'att-3', attemptCount: 3, updatedAt: now,
    })
    mismatchBatch.set(doc(student, 'quizzes/qz/attempts/att-3'), attempt('student', 'in_progress', { attemptNumber: 99 }))
    await assertFails(mismatchBatch.commit())
  })

  it('enforces time integrity on attempt create and submission', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()

    // 1. Attempt creation with backdated startedAt is denied
    const backdatedBatch = writeBatch(student)
    backdatedBatch.set(doc(student, 'quizzes/qz/participants/student'), participant('student', 'att-backdated'))
    backdatedBatch.set(doc(student, 'quizzes/qz/attempts/att-backdated'), attempt('student', 'in_progress', { startedAt: Timestamp.fromMillis(1000) }))
    await assertFails(backdatedBatch.commit())

    // 2. Attempt creation with serverTimestamp() succeeds
    const validBatch = writeBatch(student)
    validBatch.set(doc(student, 'quizzes/qz/participants/student'), participant('student', 'att-valid'))
    validBatch.set(doc(student, 'quizzes/qz/attempts/att-valid'), attempt('student', 'in_progress', { startedAt: serverTimestamp() }))
    await assertSucceeds(validBatch.commit())

    // 3. Timed quiz: submitting within limit passes
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/qz'), { 'settings.timeLimitMinutes': 10 })
      // Seed an attempt started 5 minutes ago (well within 10 min + 2 min grace)
      const fiveMinsAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000)
      await setDoc(doc(db, 'quizzes/qz/participants/student'), {
        userId: 'student', userName: 'Student', createdAt: fiveMinsAgo, updatedAt: fiveMinsAgo, attemptCount: 1, activeAttemptId: 'att-ontime',
      })
      await setDoc(doc(db, 'quizzes/qz/attempts/att-ontime'), attempt('student', 'in_progress', { startedAt: fiveMinsAgo }))
    })

    const onTimeSubmit = writeBatch(student)
    onTimeSubmit.update(doc(student, 'quizzes/qz/attempts/att-ontime'), { status: 'submitted', submittedAt: serverTimestamp(), timeSpentSeconds: 300 })
    onTimeSubmit.update(doc(student, 'quizzes/qz/participants/student'), { activeAttemptId: null, updatedAt: serverTimestamp() })
    onTimeSubmit.set(doc(student, 'quizzes/qz/results/att-ontime'), result('student'))
    await assertSucceeds(onTimeSubmit.commit())

    // 4. Timed quiz: submitting long after the limit now PASSES and reads back as late via isLate
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      // Seed an attempt started 15 minutes ago
      const fifteenMinsAgo = Timestamp.fromMillis(Date.now() - 15 * 60 * 1000)
      await setDoc(doc(db, 'quizzes/qz/participants/student'), {
        userId: 'student', userName: 'Student', createdAt: fifteenMinsAgo, updatedAt: fifteenMinsAgo, attemptCount: 2, activeAttemptId: 'att-expired',
      })
      await setDoc(doc(db, 'quizzes/qz/attempts/att-expired'), attempt('student', 'in_progress', { attemptNumber: 2, startedAt: fifteenMinsAgo }))
    })

    const lateSubmit = writeBatch(student)
    lateSubmit.update(doc(student, 'quizzes/qz/attempts/att-expired'), { status: 'submitted', submittedAt: serverTimestamp(), timeSpentSeconds: 900 })
    lateSubmit.update(doc(student, 'quizzes/qz/participants/student'), { activeAttemptId: null, updatedAt: serverTimestamp() })
    lateSubmit.set(doc(student, 'quizzes/qz/results/att-expired'), result('student'))
    await assertSucceeds(lateSubmit.commit())

    const lateDoc = await getDoc(doc(student, 'quizzes/qz/attempts/att-expired'))
    expect(lateDoc.exists()).toBe(true)
    const lateData = lateDoc.data()!
    const lateCheck = isLate(lateData.startedAt, lateData.submittedAt, 10)
    expect(lateCheck.late).toBe(true)
    expect(lateCheck.lateBySeconds).toBeGreaterThanOrEqual(180)

    // 5. A fresh attempt can be started after a late submission when attempts remain
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/qz'), { 'settings.attemptsAllowed': 5 })
    })
    const nextAttemptBatch = writeBatch(student)
    nextAttemptBatch.update(doc(student, 'quizzes/qz/participants/student'), {
      activeAttemptId: 'att-fresh', attemptCount: 3, updatedAt: serverTimestamp(),
    })
    nextAttemptBatch.set(doc(student, 'quizzes/qz/attempts/att-fresh'), attempt('student', 'in_progress', { attemptNumber: 3, startedAt: serverTimestamp() }))
    await assertSucceeds(nextAttemptBatch.commit())

    // 6. submittedAt must equal request.time (a client-supplied past or future timestamp is denied)
    const clientTimeSubmit = writeBatch(student)
    clientTimeSubmit.update(doc(student, 'quizzes/qz/attempts/att-fresh'), { status: 'submitted', submittedAt: Timestamp.fromMillis(Date.now() - 1000), timeSpentSeconds: 300 })
    clientTimeSubmit.update(doc(student, 'quizzes/qz/participants/student'), { activeAttemptId: null, updatedAt: serverTimestamp() })
    clientTimeSubmit.set(doc(student, 'quizzes/qz/results/att-fresh'), result('student'))
    await assertFails(clientTimeSubmit.commit())

    // 7. Untimed quiz is unaffected by old startedAt
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/qz'), { 'settings.timeLimitMinutes': null })
      const longAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000)
      await setDoc(doc(db, 'quizzes/qz/participants/student'), {
        userId: 'student', userName: 'Student', createdAt: longAgo, updatedAt: longAgo, attemptCount: 4, activeAttemptId: 'att-untimed',
      })
      await setDoc(doc(db, 'quizzes/qz/attempts/att-untimed'), attempt('student', 'in_progress', { attemptNumber: 4, startedAt: longAgo }))
    })

    const untimedSubmit = writeBatch(student)
    untimedSubmit.update(doc(student, 'quizzes/qz/attempts/att-untimed'), { status: 'submitted', submittedAt: serverTimestamp(), timeSpentSeconds: 3600 })
    untimedSubmit.update(doc(student, 'quizzes/qz/participants/student'), { activeAttemptId: null, updatedAt: serverTimestamp() })
    untimedSubmit.set(doc(student, 'quizzes/qz/results/att-untimed'), result('student'))
    await assertSucceeds(untimedSubmit.commit())
  })

  it('enforces size caps on quiz, question, options, and attempt answers', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    const student = environment.authenticatedContext('student').firestore()

    // 1. Quiz title: > 200 chars denied, <= 200 chars allowed
    const longTitleQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, title: 'T'.repeat(201) }
    await assertFails(setDoc(doc(owner, 'quizzes/long-title'), longTitleQuiz))
    const validTitleQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, title: 'T'.repeat(200) }
    await assertSucceeds(setDoc(doc(owner, 'quizzes/valid-title'), validTitleQuiz))

    // 2. Quiz description: > 2000 chars denied, <= 2000 chars allowed
    const longDescQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, description: 'D'.repeat(2001) }
    await assertFails(setDoc(doc(owner, 'quizzes/long-desc'), longDescQuiz))
    const validDescQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, description: 'D'.repeat(2000) }
    await assertSucceeds(setDoc(doc(owner, 'quizzes/valid-desc'), validDescQuiz))

    // 3. Quiz tags list: > 20 items denied, <= 20 items allowed
    const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag-${i}`)
    const longTagsQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, tags: tooManyTags }
    await assertFails(setDoc(doc(owner, 'quizzes/long-tags'), longTagsQuiz))
    const validTags = Array.from({ length: 20 }, (_, i) => `tag-${i}`)
    const validTagsQuiz = { ...quizData('teacher', 'draft'), questionCount: 0, tags: validTags }
    await assertSucceeds(setDoc(doc(owner, 'quizzes/valid-tags'), validTagsQuiz))

    // 4. Question prompt: > 2000 chars denied, <= 2000 chars allowed
    const longPromptQ = { ...question, prompt: 'P'.repeat(2001) }
    await assertFails(setDoc(doc(owner, 'quizzes/qz/questions/long-p'), longPromptQ))
    const validPromptQ = { ...question, prompt: 'P'.repeat(2000) }
    await assertSucceeds(setDoc(doc(owner, 'quizzes/qz/questions/valid-p'), validPromptQ))

    // 5. Options text: > 500 chars denied, <= 500 chars allowed
    const longOptionQ = {
      ...question,
      options: [{ id: 'a', text: 'O'.repeat(501) }, { id: 'b', text: 'B' }],
    }
    await assertFails(setDoc(doc(owner, 'quizzes/qz/questions/long-opt'), longOptionQ))
    const validOptionQ = {
      ...question,
      options: [{ id: 'a', text: 'O'.repeat(500) }, { id: 'b', text: 'B' }],
    }
    await assertSucceeds(setDoc(doc(owner, 'quizzes/qz/questions/valid-opt'), validOptionQ))

    // 6. Attempt answers map: > 200 keys denied, <= 200 keys allowed
    const tooManyAnswers: Record<string, string> = {}
    for (let i = 0; i < 201; i += 1) tooManyAnswers[`q${i}`] = 'ans'

    const tooManyAnswersBatch = writeBatch(student)
    tooManyAnswersBatch.set(doc(student, 'quizzes/qz/participants/student'), participant('student', 'att-too-many'))
    tooManyAnswersBatch.set(doc(student, 'quizzes/qz/attempts/att-too-many'), attempt('student', 'in_progress', { answers: tooManyAnswers }))
    await assertFails(tooManyAnswersBatch.commit())

    const validAnswers: Record<string, string> = {}
    for (let i = 0; i < 200; i += 1) validAnswers[`q${i}`] = 'ans'

    const validAnswersBatch = writeBatch(student)
    validAnswersBatch.set(doc(student, 'quizzes/qz/participants/student'), participant('student', 'att-valid-ans'))
    validAnswersBatch.set(doc(student, 'quizzes/qz/attempts/att-valid-ans'), attempt('student', 'in_progress', { answers: validAnswers }))
    await assertSucceeds(validAnswersBatch.commit())
  })
})

describe('canvas mode Firestore rules', () => {
  const canvasSettings = {
    answerReveal: 'after_submit',
    participation: { type: 'individual' },
    scoreVisibility: 'immediate',
    scoresReleased: false,
    timeLimitMinutes: null,
    attemptsAllowed: 1,
    shuffleQuestions: false,
    shuffleOptions: false,
  }

  const canvasQuiz = (ownerId = 'teacher', status = 'draft', overrides: Record<string, unknown> = {}) => ({
    ownerId,
    ownerName: 'Teacher',
    classId: 'class1',
    title: 'Circuit Canvas',
    description: 'Canvas quiz test',
    tags: [],
    mode: 'canvas',
    status,
    questionCount: status === 'published' ? 1 : 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
    settings: canvasSettings,
    ...overrides,
  })

  const canvasQuestion = (cardsCount = 2, overrides: Record<string, unknown> = {}) => ({
    order: 0,
    type: 'canvas',
    prompt: 'Connect the components',
    points: 100,
    layoutMode: 'scattered',
    directed: true,
    wrongPenalty: 'half',
    cards: Array.from({ length: cardsCount }, (_, i) => ({
      id: `c${i}`,
      type: 'note',
      content: `Card ${i}`,
      position: { x: 0, y: 0 },
    })),
    ...overrides,
  })

  const canvasKey = (connectionsCount = 1, overrides: Record<string, unknown> = {}) => ({
    type: 'canvas',
    explanation: 'Wiring guide',
    connections: Array.from({ length: connectionsCount }, (_, i) => ({
      id: `k${i}`,
      from: 'c0',
      to: 'c1',
      points: 1,
    })),
    ...overrides,
  })

  it('enforces quiz settings: group participation and shuffle true denied', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()

    // Group participation denied for canvas
    await assertFails(
      setDoc(doc(owner, 'quizzes/c-grp'), {
        ...canvasQuiz(),
        settings: { ...canvasSettings, participation: { type: 'group', groupSize: 2 } },
      }),
    )

    // shuffleQuestions true denied
    await assertFails(
      setDoc(doc(owner, 'quizzes/c-shuf-q'), {
        ...canvasQuiz(),
        settings: { ...canvasSettings, shuffleQuestions: true },
      }),
    )

    // shuffleOptions true denied
    await assertFails(
      setDoc(doc(owner, 'quizzes/c-shuf-o'), {
        ...canvasQuiz(),
        settings: { ...canvasSettings, shuffleOptions: true },
      }),
    )

    // Valid canvas quiz succeeds
    await assertSucceeds(setDoc(doc(owner, 'quizzes/c-valid'), canvasQuiz()))
  })

  it('enforces publishing requirement: questionCount must be 1', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/c-pub-draft'), canvasQuiz('teacher', 'draft'))
    })

    // questionCount == 0 denied
    await assertFails(
      updateDoc(doc(owner, 'quizzes/c-pub-draft'), {
        status: 'published',
        publishedAt: now,
        questionCount: 0,
      }),
    )

    // questionCount == 2 denied
    await assertFails(
      updateDoc(doc(owner, 'quizzes/c-pub-draft'), {
        status: 'published',
        publishedAt: now,
        questionCount: 2,
      }),
    )

    // questionCount == 1 allowed
    await assertSucceeds(
      updateDoc(doc(owner, 'quizzes/c-pub-draft'), {
        status: 'published',
        publishedAt: now,
        questionCount: 1,
      }),
    )
  })

  it('enforces question rules: card limit, layoutMode, wrongPenalty, doc ID, and quiz mode', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    const student = environment.authenticatedContext('student').firestore()

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/canvasQz'), canvasQuiz())
    })

    // 51 cards denied, 50 cards allowed
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/questions/board'), canvasQuestion(51)))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/canvasQz/questions/board'), canvasQuestion(50)))

    // Invalid wrongPenalty denied
    await assertFails(
      setDoc(doc(owner, 'quizzes/canvasQz/questions/board'), canvasQuestion(2, { wrongPenalty: 'invalid' })),
    )

    // Invalid layoutMode denied
    await assertFails(
      setDoc(doc(owner, 'quizzes/canvasQz/questions/board'), canvasQuestion(2, { layoutMode: 'floating' })),
    )

    // Question ID other than 'board' denied
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/questions/otherId'), canvasQuestion(2)))

    // Canvas question in normal quiz denied
    await assertFails(setDoc(doc(owner, 'quizzes/qz/questions/board'), canvasQuestion(2)))

    // Normal question in canvas quiz denied
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/questions/board'), question))

    // Student cannot write questions
    await assertFails(setDoc(doc(student, 'quizzes/canvasQz/questions/board'), canvasQuestion(2)))
  })

  it('enforces answer key rules: connection limit, matchingAnswerKey, student access', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore()
    const student = environment.authenticatedContext('student').firestore()

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/canvasQz'), canvasQuiz())
      await setDoc(doc(db, 'quizzes/canvasQz/questions/board'), canvasQuestion(2))
    })

    // 81 connections denied, 80 allowed
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/answerKeys/board'), canvasKey(81)))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/canvasQz/answerKeys/board'), canvasKey(80)))

    // Key id other than 'board' denied
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/answerKeys/other'), canvasKey(1)))

    // Student cannot write answer keys
    await assertFails(setDoc(doc(student, 'quizzes/canvasQz/answerKeys/board'), canvasKey(1)))

    // Key for normal question in canvas quiz denied
    await assertFails(setDoc(doc(owner, 'quizzes/canvasQz/answerKeys/board'), key))

    // Canvas key for normal question in normal quiz denied
    await assertFails(setDoc(doc(owner, 'quizzes/qz/answerKeys/q'), canvasKey(1)))
  })

  it('governs student answer key read access: before vs after starting attempt', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/canvasPub'), canvasQuiz('teacher', 'published'))
      await setDoc(doc(db, 'quizzes/canvasPub/questions/board'), canvasQuestion(2))
      await setDoc(doc(db, 'quizzes/canvasPub/answerKeys/board'), canvasKey(2))
    })

    // Before starting (no participant document): read denied
    await assertFails(getDoc(doc(student, 'quizzes/canvasPub/answerKeys/board')))

    // Start attempt (create participant + attempt): read succeeds
    const startBatch = writeBatch(student)
    startBatch.set(doc(student, 'quizzes/canvasPub/participants/student'), participant('student', 'att-canvas-1'))
    startBatch.set(
      doc(student, 'quizzes/canvasPub/attempts/att-canvas-1'),
      attempt('student', 'in_progress', { questionOrder: ['board'], optionOrder: {} }),
    )
    await assertSucceeds(startBatch.commit())

    // After starting: student can read answer key
    await assertSucceeds(getDoc(doc(student, 'quizzes/canvasPub/answerKeys/board')))
  })

  it('enforces attempt answer caps for board and layout, while normal attempts are unaffected', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/canvasPub'), canvasQuiz('teacher', 'published'))
      await setDoc(doc(db, 'quizzes/canvasPub/questions/board'), canvasQuestion(2))
      await setDoc(doc(db, 'quizzes/canvasPub/answerKeys/board'), canvasKey(2))
    })

    // Normal quiz attempt is unaffected
    const normalBatch = writeBatch(student)
    normalBatch.set(doc(student, 'quizzes/qz/participants/student'), participant('student', 'att-norm'))
    normalBatch.set(doc(student, 'quizzes/qz/attempts/att-norm'), attempt('student', 'in_progress', { answers: { q: 'b' } }))
    await assertSucceeds(normalBatch.commit())

    // answers.board with 81 items denied
    const tooManyBoard = Array.from({ length: 81 }, (_, i) => `c0->c1-${i}`)
    const failBoardBatch = writeBatch(student)
    failBoardBatch.set(doc(student, 'quizzes/canvasPub/participants/student'), participant('student', 'att-b-81'))
    failBoardBatch.set(
      doc(student, 'quizzes/canvasPub/attempts/att-b-81'),
      attempt('student', 'in_progress', { answers: { board: tooManyBoard } }),
    )
    await assertFails(failBoardBatch.commit())

    // answers.layout with 51 items denied
    const tooManyLayout = Array.from({ length: 51 }, (_, i) => `c${i}:10:20`)
    const failLayoutBatch = writeBatch(student)
    failLayoutBatch.set(doc(student, 'quizzes/canvasPub/participants/student'), participant('student', 'att-l-51'))
    failLayoutBatch.set(
      doc(student, 'quizzes/canvasPub/attempts/att-l-51'),
      attempt('student', 'in_progress', { answers: { layout: tooManyLayout } }),
    )
    await assertFails(failLayoutBatch.commit())

    // 80 board connections and 50 layout items allowed
    const validBoard = Array.from({ length: 80 }, (_, i) => `c0->c1-${i}`)
    const validLayout = Array.from({ length: 50 }, (_, i) => `c${i}:10:20`)
    const successBatch = writeBatch(student)
    successBatch.set(doc(student, 'quizzes/canvasPub/participants/student'), participant('student', 'att-valid-c'))
    successBatch.set(
      doc(student, 'quizzes/canvasPub/attempts/att-valid-c'),
      attempt('student', 'in_progress', { answers: { board: validBoard, layout: validLayout } }),
    )
    await assertSucceeds(successBatch.commit())
  })

  it('enforces attempt-limit and late-submission rules for canvas attempts', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore()

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(
        doc(db, 'quizzes/canvasTimed'),
        canvasQuiz('teacher', 'published', {
          settings: { ...canvasSettings, attemptsAllowed: 1, timeLimitMinutes: 1 },
        }),
      )
      await setDoc(doc(db, 'quizzes/canvasTimed/questions/board'), canvasQuestion(2))
      await setDoc(doc(db, 'quizzes/canvasTimed/answerKeys/board'), canvasKey(2))
    })

    // Start 1st attempt succeeds
    const startBatch = writeBatch(student)
    startBatch.set(doc(student, 'quizzes/canvasTimed/participants/student'), participant('student', 'att-1'))
    startBatch.set(
      doc(student, 'quizzes/canvasTimed/attempts/att-1'),
      attempt('student', 'in_progress', { questionOrder: ['board'], optionOrder: {} }),
    )
    await assertSucceeds(startBatch.commit())

    // Submit attempt on time succeeds
    const submitBatch = writeBatch(student)
    submitBatch.update(doc(student, 'quizzes/canvasTimed/participants/student'), {
      activeAttemptId: null,
      updatedAt: now,
    })
    submitBatch.update(doc(student, 'quizzes/canvasTimed/attempts/att-1'), {
      status: 'submitted',
      submittedAt: serverTimestamp(),
      timeSpentSeconds: 30,
    })
    submitBatch.set(doc(student, 'quizzes/canvasTimed/results/att-1'), result('student'))
    await assertSucceeds(submitBatch.commit())

    // Late submission passes rules and is flagged as late by isLate
    const tenMinsAgo = Timestamp.fromMillis(Date.now() - 10 * 60 * 1000)
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await updateDoc(doc(db, 'quizzes/canvasTimed'), { 'settings.attemptsAllowed': 2 })
      await setDoc(doc(db, 'quizzes/canvasTimed/participants/student'), {
        userId: 'student', userName: 'Student', createdAt: tenMinsAgo, updatedAt: tenMinsAgo, attemptCount: 2, activeAttemptId: 'att-late',
      })
      await setDoc(doc(db, 'quizzes/canvasTimed/attempts/att-late'), attempt('student', 'in_progress', { attemptNumber: 2, startedAt: tenMinsAgo }))
    })

    const lateSubmit = writeBatch(student)
    lateSubmit.update(doc(student, 'quizzes/canvasTimed/participants/student'), { activeAttemptId: null, updatedAt: serverTimestamp() })
    lateSubmit.update(doc(student, 'quizzes/canvasTimed/attempts/att-late'), {
      status: 'submitted',
      submittedAt: serverTimestamp(),
      timeSpentSeconds: 600,
    })
    lateSubmit.set(doc(student, 'quizzes/canvasTimed/results/att-late'), result('student'))
    await assertSucceeds(lateSubmit.commit())

    const lateAttemptDoc = await getDoc(doc(student, 'quizzes/canvasTimed/attempts/att-late'))
    const lateData = lateAttemptDoc.data()!
    const lateCheck = isLate(lateData.startedAt, lateData.submittedAt, 1)
    expect(lateCheck.late).toBe(true)

    // Third attempt denied since attemptsAllowed == 2
    const thirdBatch = writeBatch(student)
    thirdBatch.update(doc(student, 'quizzes/canvasTimed/participants/student'), { activeAttemptId: 'att-3', attemptCount: 3, updatedAt: serverTimestamp() })
    thirdBatch.set(doc(student, 'quizzes/canvasTimed/attempts/att-3'), attempt('student', 'in_progress', { attemptNumber: 3, questionOrder: ['board'], optionOrder: {} }))
    await assertFails(thirdBatch.commit())
  })

  it('enforces quiz mode immutability on draft and published quizzes while permitting valid updates, creation of each mode, and duplicate mode copying', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore

    const flashcardSettings = {
      answerReveal: 'never',
      participation: { type: 'individual' },
      scoreVisibility: 'hidden',
      scoresReleased: false,
      timeLimitMinutes: null,
      attemptsAllowed: 1,
      shuffleQuestions: false,
      shuffleOptions: false,
    }

    // 1. Creating each mode still works
    await assertSucceeds(setDoc(doc(owner, 'quizzes/new-quiz'), { ...quizData('teacher', 'draft'), mode: 'quiz', questionCount: 0, publishedAt: null }))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/new-flash'), { ...quizData('teacher', 'draft'), mode: 'flashcards', settings: flashcardSettings, questionCount: 0, publishedAt: null }))
    await assertSucceeds(setDoc(doc(owner, 'quizzes/new-canvas'), canvasQuiz('teacher', 'draft')))

    // Seed draft and published versions of quiz and canvas
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/qz-draft'), { ...quizData('teacher', 'draft'), questionCount: 0, publishedAt: null })
      await setDoc(doc(db, 'quizzes/cv-draft'), canvasQuiz('teacher', 'draft'))
      await setDoc(doc(db, 'quizzes/cv-pub'), canvasQuiz('teacher', 'published'))
      await setDoc(doc(db, 'quizzes/cv-pub/questions/board'), canvasQuestion(2))
      await setDoc(doc(db, 'quizzes/cv-pub/answerKeys/board'), canvasKey(1))
    })

    // 2. Owner cannot change mode on draft quizzes:
    // quiz -> canvas denied
    await assertFails(updateDoc(doc(owner, 'quizzes/qz-draft'), { mode: 'canvas' }))
    // canvas -> quiz denied
    await assertFails(updateDoc(doc(owner, 'quizzes/cv-draft'), { mode: 'quiz' }))
    // quiz -> flashcards denied
    await assertFails(updateDoc(doc(owner, 'quizzes/qz-draft'), { mode: 'flashcards' }))

    // 3. Owner cannot change mode on published quizzes:
    // quiz -> canvas denied
    await assertFails(updateDoc(doc(owner, 'quizzes/qz'), { mode: 'canvas' }))
    // canvas -> quiz denied
    await assertFails(updateDoc(doc(owner, 'quizzes/cv-pub'), { mode: 'quiz' }))
    // quiz -> flashcards denied
    await assertFails(updateDoc(doc(owner, 'quizzes/qz'), { mode: 'flashcards' }))

    // 4. Owner CAN still update title, settings, and status
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz-draft'), { title: 'Renamed Quiz', updatedAt: now }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz-draft'), { 'settings.timeLimitMinutes': 20, updatedAt: now }))
    await assertSucceeds(updateDoc(doc(owner, 'quizzes/qz-draft'), { status: 'archived', updatedAt: now }))

    // 5. Duplicating copies the mode for quiz, flashcards, and canvas
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/fc-to-dup'), {
        ...quizData('teacher', 'draft'),
        mode: 'flashcards',
        settings: flashcardSettings,
        questionCount: 1,
        publishedAt: null,
      })
      await setDoc(doc(db, 'quizzes/fc-to-dup/questions/q1'), {
        order: 0,
        type: 'flashcard',
        prompt: 'Front',
        points: 1,
      })
      await setDoc(doc(db, 'quizzes/fc-to-dup/answerKeys/q1'), {
        type: 'flashcard',
        back: 'Back',
        explanation: '',
        caseSensitive: false,
      })
    })

    const quizCopyId = await duplicateQuiz('qz', owner)
    const quizCopySnap = await getDoc(doc(owner, 'quizzes', quizCopyId))
    expect(quizCopySnap.data()?.mode).toBe('quiz')

    const flashCopyId = await duplicateQuiz('fc-to-dup', owner)
    const flashCopySnap = await getDoc(doc(owner, 'quizzes', flashCopyId))
    expect(flashCopySnap.data()?.mode).toBe('flashcards')

    const canvasCopyId = await duplicateQuiz('cv-pub', owner)
    const canvasCopySnap = await getDoc(doc(owner, 'quizzes', canvasCopyId))
    expect(canvasCopySnap.data()?.mode).toBe('canvas')
  })

  it('answer-size safety: student autosaves and submits 80 connection strings for a canvas attempt, and result is stored', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore

    // Setup published canvas quiz with cards and answer key
    const canvasQDoc = canvasQuestion(40)
    const canvasKDoc = {
      type: 'canvas' as const,
      explanation: 'Key guide',
      connections: Array.from({ length: 39 }, (_, i) => ({
        id: `k${i}`,
        from: `c${i}`,
        to: `c${i + 1}`,
        points: 1,
      })),
    }

    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/canvasSafety'), canvasQuiz('teacher', 'published'))
      await setDoc(doc(db, 'quizzes/canvasSafety/questions/board'), canvasQDoc)
      await setDoc(doc(db, 'quizzes/canvasSafety/answerKeys/board'), canvasKDoc)
    })

    // 1. Student starts attempt
    const attemptId = await startAttempt('canvasSafety', 'student', 'Student', student)
    expect(attemptId).toBeTruthy()

    // 2. Student autosaves 80 distinct connection strings (at the cap)
    const eightyConnections: string[] = []
    for (let i = 0; i < 40 && eightyConnections.length < 80; i += 1) {
      for (let j = 0; j < 40 && eightyConnections.length < 80; j += 1) {
        if (i !== j) {
          eightyConnections.push(`c${i}->c${j}`)
        }
      }
    }
    expect(eightyConnections.length).toBe(80)

    await assertSucceeds(
      autosaveAnswers('canvasSafety', attemptId, { board: eightyConnections }, student),
    )

    // 3. 81 connection strings is rejected by firestore rules (validAttempt: board.size() <= 80)
    const eightyOneConnections = [...eightyConnections, 'c39->c0']
    await assertFails(
      autosaveAnswers('canvasSafety', attemptId, { board: eightyOneConnections }, student),
    )

    // 4. Student submits attempt with the 80 valid connection strings
    const submission = await submitAttempt('canvasSafety', attemptId, 45, student)
    expect(submission.attempt.status).toBe('submitted')

    // 5. Result document is stored and accessible
    const resultSnap = await getDoc(doc(student, `quizzes/canvasSafety/results/${attemptId}`))
    expect(resultSnap.exists()).toBe(true)
    const resultData = resultSnap.data()
    expect(resultData?.userId).toBe('student')
    expect(resultData?.perQuestion?.board).toBeDefined()
    expect(typeof resultData?.score).toBe('number')
  })

  it('full flow: instructor creates canvas quiz, student plays, submits, and score matches gradeCanvasQuestion', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore

    // 1. Instructor creates canvas quiz in class1
    const quizId = 'flow-canvas-qz'
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `quizzes/${quizId}`), {
        ...canvasQuiz('teacher', 'draft'),
        title: 'Photosynthesis Canvas',
      })
    })

    const customQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect light reactions to Calvin cycle',
      points: 100,
      layoutMode: 'scattered',
      directed: true,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Light Reactions', content: 'Thylakoid', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Calvin Cycle', content: 'Stroma', position: { x: 100, y: 0 } },
        { id: 'c3', type: 'paragraph', title: 'ATP & NADPH', content: 'Energy carriers', position: { x: 200, y: 0 } },
        { id: 'c4', type: 'paragraph', title: 'Mitochondria', content: 'Unrelated', position: { x: 300, y: 0 } },
      ],
    }

    const customKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: 'Light reactions produce ATP & NADPH for the Calvin cycle.',
      connections: [
        { id: 'c1->c3', from: 'c1', to: 'c3', points: 1 },
        { id: 'c3->c2', from: 'c3', to: 'c2', points: 1 },
      ],
    }

    // Save question and key
    await saveQuestionAndKey(quizId, 'board', customQuestion, customKey, owner)

    // Publish quiz
    await updateDoc(doc(owner, `quizzes/${quizId}`), {
      status: 'published',
      publishedAt: Timestamp.now(),
    })

    // 2. Student starts attempt
    const attemptId = await startAttempt(quizId, 'student', 'Student', student)
    expect(attemptId).toBeTruthy()

    // 3. Student connects: 1 correct (c1->c3) and 1 wrong (c1->c4)
    const studentConnections = ['c1->c3', 'c1->c4']
    await autosaveAnswers(quizId, attemptId, { board: studentConnections }, student)

    // 4. Student submits
    const submission = await submitAttempt(quizId, attemptId, 30, student)
    expect(submission.attempt.status).toBe('submitted')

    // 5. Verify score exactly matches pure gradeCanvasQuestion
    const expectedGrade = gradeCanvasQuestion(customQuestion, customKey, studentConnections)
    expect(submission.result.score).toBe(expectedGrade.pointsAwarded)
    expect(submission.result.perQuestion.board.correct).toBe(expectedGrade.correct)
    expect(submission.result.perQuestion.board.pointsAwarded).toBe(expectedGrade.pointsAwarded)
  })

  it('full flow: undirected canvas quiz where student connects, submits, and score matches gradeCanvasQuestion', async () => {
    await seed()
    const owner = environment.authenticatedContext('teacher').firestore() as unknown as Firestore
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore

    // 1. Instructor creates undirected canvas quiz in class1
    const quizId = 'flow-undir-canvas-qz'
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, `quizzes/${quizId}`), {
        ...canvasQuiz('teacher', 'draft'),
        title: 'Molecules Undirected Canvas',
      })
    })

    const customQuestion: CanvasQuestion = {
      order: 0,
      type: 'canvas',
      prompt: 'Connect bonded atoms',
      points: 100,
      layoutMode: 'scattered',
      directed: false,
      wrongPenalty: 'half',
      cards: [
        { id: 'c1', type: 'note', title: 'Carbon 1', content: 'C', position: { x: 0, y: 0 } },
        { id: 'c2', type: 'note', title: 'Carbon 2', content: 'C', position: { x: 100, y: 0 } },
        { id: 'c3', type: 'paragraph', title: 'Hydrogen', content: 'H', position: { x: 200, y: 0 } },
        { id: 'c4', type: 'paragraph', title: 'Helium', content: 'Noble gas', position: { x: 300, y: 0 } },
      ],
    }

    const customKey: CanvasAnswerKey = {
      type: 'canvas',
      explanation: 'Carbon bonds to Carbon and Hydrogen.',
      connections: [
        { id: 'c1<->c2', from: 'c1', to: 'c2', points: 1 },
        { id: 'c2<->c3', from: 'c2', to: 'c3', points: 1 },
      ],
    }

    // Save question and key
    await saveQuestionAndKey(quizId, 'board', customQuestion, customKey, owner)

    // Publish quiz
    await updateDoc(doc(owner, `quizzes/${quizId}`), {
      status: 'published',
      publishedAt: Timestamp.now(),
    })

    // 2. Student starts attempt
    const attemptId = await startAttempt(quizId, 'student', 'Student', student)
    expect(attemptId).toBeTruthy()

    // 3. Student connects in undirected format: 1 correct (c1<->c2) and 1 wrong (c2<->c4)
    const studentConnections = ['c1<->c2', 'c2<->c4']
    await autosaveAnswers(quizId, attemptId, { board: studentConnections }, student)

    // 4. Student submits
    const submission = await submitAttempt(quizId, attemptId, 30, student)
    expect(submission.attempt.status).toBe('submitted')

    // 5. Verify score exactly matches pure gradeCanvasQuestion
    const expectedGrade = gradeCanvasQuestion(customQuestion, customKey, studentConnections)
    expect(submission.result.score).toBe(expectedGrade.pointsAwarded)
    expect(submission.result.perQuestion.board.correct).toBe(expectedGrade.correct)
    expect(submission.result.perQuestion.board.pointsAwarded).toBe(expectedGrade.pointsAwarded)
  })

  it('regression: standard quiz and flashcard flows remain unchanged', async () => {
    await seed()
    const student = environment.authenticatedContext('student').firestore() as unknown as Firestore

    // 1. Standard quiz attempt
    const quizAttemptId = await startAttempt('qz', 'student', 'Student', student)
    expect(quizAttemptId).toBeTruthy()
    await autosaveAnswers('qz', quizAttemptId, { q: 'b' }, student)
    const quizSubmission = await submitAttempt('qz', quizAttemptId, 15, student)
    expect(quizSubmission.result.score).toBe(2)
    expect(quizSubmission.result.perQuestion.q.correct).toBe(true)

    // 2. Flashcard attempt
    const fcSettings = {
      ...settings,
      answerReveal: 'never' as const,
      scoreVisibility: 'hidden' as const,
    }
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'quizzes/fc-pub'), {
        ...quizData('teacher', 'published'),
        mode: 'flashcards',
        settings: fcSettings,
        questionCount: 1,
      })
      await setDoc(doc(db, 'quizzes/fc-pub/questions/q1'), {
        order: 0,
        type: 'flashcard',
        prompt: 'Flashcard Front',
        points: 1,
      })
      await setDoc(doc(db, 'quizzes/fc-pub/answerKeys/q1'), {
        type: 'flashcard',
        back: 'Flashcard Back',
        explanation: '',
        caseSensitive: false,
      })
    })

    const fcAttemptId = await startAttempt('fc-pub', 'student', 'Student', student)
    expect(fcAttemptId).toBeTruthy()
    await autosaveAnswers('fc-pub', fcAttemptId, { q1: 'knew' }, student)
    const fcSubmission = await submitAttempt('fc-pub', fcAttemptId, 10, student)
    expect(fcSubmission.result.perQuestion.q1.correct).toBe(null)
    expect(fcSubmission.result.score).toBe(0)
  })
})
