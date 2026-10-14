// @vitest-environment node
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { overrideTeamQuestion } from './groupQuizPlay'

const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)
const as = (uid: string, data: unknown) => ({ auth: { uid, token: { firebase: { sign_in_provider: 'google.com' } } }, data }) as never

describe.skipIf(!hasEmulator)('group quiz play (emulator)', () => {
  let db: FirebaseFirestore.Firestore
  beforeAll(() => {
    if (getApps().length === 0) initializeApp({ projectId: 'demo-peerly-collab' })
    db = getFirestore()
  })
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-peerly-collab/databases/(default)/documents`, { method: 'DELETE' })
  })

  it('guarantees overrideTeamQuestion idempotency: duplicate call does not skip a question or phase', async () => {
    const quizId = 'q1'
    const teamId = 't1'
    await db.doc(`quizzes/${quizId}`).set({
      ownerId: 'teacher',
      classId: 'c1',
      status: 'published',
      mode: 'quiz',
      settings: {
        participation: { type: 'group', groupSize: 2, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: true, questionTimeSec: null },
        answerReveal: 'after_submit',
      },
    })
    await db.doc(`quizzes/${quizId}/questions/q0`).set({
      order: 0,
      type: 'multiple_choice',
      prompt: 'Q0',
      points: 10,
      options: [{ id: 'opt0', text: 'Option 0' }, { id: 'opt1', text: 'Option 1' }],
    })
    await db.doc(`quizzes/${quizId}/questions/q1`).set({
      order: 1,
      type: 'multiple_choice',
      prompt: 'Q1',
      points: 10,
      options: [{ id: 'opt0', text: 'Option 0' }, { id: 'opt1', text: 'Option 1' }],
    })
    await db.doc(`quizzes/${quizId}/teams/${teamId}`).set({
      name: 'Team 1',
      memberIds: ['s1', 's2'],
      memberNames: { s1: 'Student 1', s2: 'Student 2' },
      representativeId: 's1',
      code: null,
      studyGroupId: null,
      status: 'in_progress',
      createdBy: 'teacher',
    })
    await db.doc(`quizzes/${quizId}/teamPrivate/${teamId}`).set({
      questionOrder: ['q0', 'q1'],
      optionOrder: { q0: ['opt0', 'opt1'], q1: ['opt0', 'opt1'] },
      picks: {},
      finalAnswers: {},
      startedAtMs: Date.now(),
    })
    await db.doc(`quizzes/${quizId}/teamSessions/${teamId}`).set({
      phase: 'answering',
      currentIndex: 0,
      total: 2,
      questionStartedAt: Date.now(),
      questionEndsAt: null,
      reviewStartedAt: null,
      question: {
        id: 'q0',
        index: 0,
        type: 'multiple_choice',
        prompt: 'Q0',
        points: 10,
        options: [{ id: 'opt0', text: 'Option 0' }, { id: 'opt1', text: 'Option 1' }],
      },
      answered: {},
      picks: null,
      locked: false,
      ready: {},
    })

    // First call: overrides answering -> review for question 0
    const firstCall = await overrideTeamQuestion(as('teacher', { quizId, teamId, questionIndex: 0, expectedPhase: 'answering' })) as { advanced: boolean; phase: string; currentIndex: number }
    expect(firstCall.advanced).toBe(true)
    expect(firstCall.phase).toBe('review')
    expect(firstCall.currentIndex).toBe(0)

    const sessionAfterFirst = (await db.doc(`quizzes/${quizId}/teamSessions/${teamId}`).get()).data()!
    expect(sessionAfterFirst.phase).toBe('review')
    expect(sessionAfterFirst.currentIndex).toBe(0)

    // DUPLICATE CALL: retry with same questionIndex 0 and expectedPhase 'answering'
    const duplicateCall = await overrideTeamQuestion(as('teacher', { quizId, teamId, questionIndex: 0, expectedPhase: 'answering' })) as { advanced: boolean; phase: string; currentIndex: number }
    // Mismatch! Must return advanced: false and NOT advance from review to question 1!
    expect(duplicateCall.advanced).toBe(false)
    expect(duplicateCall.phase).toBe('review')
    expect(duplicateCall.currentIndex).toBe(0)

    const sessionAfterDuplicate = (await db.doc(`quizzes/${quizId}/teamSessions/${teamId}`).get()).data()!
    expect(sessionAfterDuplicate.phase).toBe('review')
    expect(sessionAfterDuplicate.currentIndex).toBe(0)

    // Valid second call: overrides review -> next question (index 1, phase 'answering')
    const secondCall = await overrideTeamQuestion(as('teacher', { quizId, teamId, questionIndex: 0, expectedPhase: 'review' })) as { advanced: boolean; phase: string; currentIndex: number }
    expect(secondCall.advanced).toBe(true)
    expect(secondCall.phase).toBe('answering')
    expect(secondCall.currentIndex).toBe(1)

    // Duplicate call with previous review payload
    const duplicateReviewCall = await overrideTeamQuestion(as('teacher', { quizId, teamId, questionIndex: 0, expectedPhase: 'review' })) as { advanced: boolean; phase: string; currentIndex: number }
    expect(duplicateReviewCall.advanced).toBe(false)
    expect(duplicateReviewCall.currentIndex).toBe(1)
  })
})
