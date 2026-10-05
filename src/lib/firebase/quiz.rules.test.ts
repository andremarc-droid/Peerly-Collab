import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { serverTimestamp, Timestamp, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import rules from '../../../firestore.rules?raw'
import { isLate } from '../../features/quizzes/results/resultLogic'

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
