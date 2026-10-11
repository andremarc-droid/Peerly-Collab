import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import rules from '../../../firestore.rules?raw'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Rules for group quizzes. These need the Firestore emulator (see AGENTS.md); they were written without being able to run it.
 * Clients only ever READ team data; every write comes from Cloud Functions, which bypass these rules.
 */
let env: RulesTestEnvironment
const day = new Date(1_700_000_000_000)

const individual = { type: 'individual' as const }
const group = { type: 'group' as const, groupSize: 3, answerMode: 'everyone', teamFormation: 'self', waitForEveryone: true, questionTimeSec: 30 }
const settings = (participation: Record<string, unknown>) => ({
  answerReveal: 'after_each', participation, scoreVisibility: 'immediate', scoresReleased: false,
  timeLimitMinutes: null, attemptsAllowed: null, shuffleQuestions: false, shuffleOptions: false,
})
const quizDoc = (participation: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  ownerId: 'teacher', ownerName: 'Teacher', classId: 'c1', title: 'Quiz', description: '', tags: [], mode: 'quiz', status: 'published',
  questionCount: 1, createdAt: day, updatedAt: day, publishedAt: day, settings: settings(participation), ...extra,
})

beforeAll(async () => { env = await initializeTestEnvironment({ projectId: 'demo-peerly-collab', firestore: { host: '127.0.0.1', port: Number(process.env.PEERLY_FIRESTORE_TEST_PORT ?? 8180), rules } }) })
afterAll(async () => env.cleanup())
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await db.doc('users/teacher').set({ role: 'instructor' })
    for (const uid of ['alice', 'bob', 'carol']) {
      await db.doc(`users/${uid}`).set({ role: 'student' })
      await db.doc(`enrollments/c1_${uid}`).set({ uid, classId: 'c1', ownerId: 'teacher', status: 'active' })
    }
    await db.doc('classes/c1').set({ ownerId: 'teacher', status: 'active' })

    await db.doc('quizzes/gq').set(quizDoc(group))
    await db.doc('quizzes/gq/questions/q1').set({ order: 0, type: 'multiple_choice', prompt: 'Pick', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] })
    await db.doc('quizzes/gq/answerKeys/q1').set({ type: 'choice', correctOptionId: 'a', explanation: '', caseSensitive: false })
    await db.doc('quizzes/gq/participants/alice').set({ userId: 'alice', userName: 'Alice', createdAt: day, updatedAt: day, attemptCount: 1, activeAttemptId: null })
    await db.doc('quizzes/gq/teams/t1').set({ name: 'Team', memberIds: ['alice', 'bob'], memberNames: { alice: 'Alice', bob: 'Bob' }, representativeId: 'alice', code: 'ABC234', studyGroupId: null, status: 'in_progress', createdBy: 'alice' })
    await db.doc('quizzes/gq/teams/t2').set({ name: 'Other', memberIds: ['carol'], memberNames: { carol: 'Carol' }, representativeId: 'carol', code: 'XYZ789', studyGroupId: null, status: 'forming', createdBy: 'carol' })
    await db.doc('quizzes/gq/teamSessions/t1').set({ phase: 'answering', currentIndex: 0, total: 1, question: { id: 'q1', index: 0, type: 'multiple_choice', prompt: 'Pick', points: 1, options: [] }, answered: {}, picks: null, locked: false, ready: {} })
    await db.doc('quizzes/gq/teamSessions/t1/reveals/0').set({ index: 0, finalAnswer: 'a', picks: {}, result: null })
    await db.doc('quizzes/gq/teamPrivate/t1').set({ questionOrder: ['q1'], picks: { q1: { alice: 'a' } }, finalAnswers: {}, startedAtMs: 1 })
    await db.doc('quizzes/gq/teamCodes/ABC234').set({ teamId: 't1' })
    await db.doc('quizzes/gq/teamMeta/summary').set({ teamCount: 2 })
    await db.doc('users/alice/groupQuizTeams/gq').set({ quizId: 'gq', teamId: 't1' })
    await db.doc('groupQuizRateLimits/alice').set({ windows: {} })

    await db.doc('quizzes/solo').set(quizDoc(individual))
    await db.doc('quizzes/solo/questions/q1').set({ order: 0, type: 'multiple_choice', prompt: 'Pick', points: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] })
    await db.doc('quizzes/solo/answerKeys/q1').set({ type: 'choice', correctOptionId: 'a', explanation: '', caseSensitive: false })
    await db.doc('quizzes/solo/participants/alice').set({ userId: 'alice', userName: 'Alice', createdAt: day, updatedAt: day, attemptCount: 1, activeAttemptId: null })

    await db.doc('quizzes/gdraft').set(quizDoc(group, { status: 'draft', publishedAt: null }))
    await db.doc('quizzes/fdraft').set(quizDoc(individual, {
      mode: 'flashcards', status: 'draft', publishedAt: null,
      settings: { ...settings(individual), answerReveal: 'never', scoreVisibility: 'hidden' },
    }))
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()

describe('group quiz team data', () => {
  it('denies signed-out users everything', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'quizzes/gq/teams/t1')))
    await assertFails(getDoc(doc(db, 'quizzes/gq/teamSessions/t1')))
    await assertFails(getDoc(doc(db, 'quizzes/gq/teamSessions/t1/reveals/0')))
  })

  it('lets team members and the quiz owner read the team, session and reveals', async () => {
    for (const uid of ['alice', 'bob', 'teacher']) {
      await assertSucceeds(getDoc(doc(as(uid), 'quizzes/gq/teams/t1')))
      await assertSucceeds(getDoc(doc(as(uid), 'quizzes/gq/teamSessions/t1')))
      await assertSucceeds(getDoc(doc(as(uid), 'quizzes/gq/teamSessions/t1/reveals/0')))
    }
  })

  it('keeps non-members out of another team, its session and its reveals', async () => {
    const carol = as('carol')
    await assertFails(getDoc(doc(carol, 'quizzes/gq/teams/t1')))
    await assertFails(getDoc(doc(carol, 'quizzes/gq/teamSessions/t1')))
    await assertFails(getDoc(doc(carol, 'quizzes/gq/teamSessions/t1/reveals/0')))
    await assertFails(getDocs(collection(carol, 'quizzes/gq/teams')))
  })

  it('lets a student list only the teams they belong to', async () => {
    const mine = await assertSucceeds(getDocs(query(collection(as('alice'), 'quizzes/gq/teams'), where('memberIds', 'array-contains', 'alice'))))
    expect(mine.docs.map(item => item.id)).toEqual(['t1'])
    await assertFails(getDocs(query(collection(as('alice'), 'quizzes/gq/teams'), where('memberIds', 'array-contains', 'carol'))))
    const all = await assertSucceeds(getDocs(collection(as('teacher'), 'quizzes/gq/teams')))
    expect(all.size).toBe(2)
  })

  it('removes access as soon as a member is taken off the team', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'quizzes/gq/teamSessions/t1')))
    await env.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('quizzes/gq/teams/t1').update({ memberIds: ['alice'] })
    })
    await assertFails(getDoc(doc(as('bob'), 'quizzes/gq/teamSessions/t1')))
    await assertFails(getDoc(doc(as('bob'), 'quizzes/gq/teams/t1')))
  })

  it('never lets anyone read private picks, team codes, counters or rate limits', async () => {
    for (const uid of ['alice', 'teacher']) {
      await assertFails(getDoc(doc(as(uid), 'quizzes/gq/teamPrivate/t1')))
      await assertFails(getDoc(doc(as(uid), 'quizzes/gq/teamCodes/ABC234')))
      await assertFails(getDoc(doc(as(uid), 'quizzes/gq/teamMeta/summary')))
      await assertFails(getDoc(doc(as(uid), 'groupQuizRateLimits/alice')))
    }
  })

  it('blocks every client write to teams, sessions, reveals, private data and membership pointers', async () => {
    for (const uid of ['alice', 'teacher']) {
      const db = as(uid)
      await assertFails(setDoc(doc(db, 'quizzes/gq/teams/new'), { name: 'X', memberIds: [uid] }))
      await assertFails(updateDoc(doc(db, 'quizzes/gq/teams/t1'), { representativeId: uid }))
      await assertFails(updateDoc(doc(db, 'quizzes/gq/teamSessions/t1'), { currentIndex: 5 }))
      await assertFails(setDoc(doc(db, 'quizzes/gq/teamSessions/t1/reveals/1'), { index: 1 }))
      await assertFails(updateDoc(doc(db, 'quizzes/gq/teamPrivate/t1'), { finalAnswers: { q1: 'a' } }))
      await assertFails(setDoc(doc(db, 'quizzes/gq/teamCodes/QQQ222'), { teamId: 't1' }))
    }
    await assertFails(setDoc(doc(as('alice'), 'users/alice/groupQuizTeams/other'), { quizId: 'other', teamId: 't9' }))
    await assertFails(deleteDoc(doc(as('alice'), 'users/alice/groupQuizTeams/gq')))
    await assertFails(deleteDoc(doc(as('alice'), 'quizzes/gq/teams/t1')))
  })

  it('lets only the quiz owner delete team data (so deleting a quiz can clean up)', async () => {
    const teacher = as('teacher')
    await assertSucceeds(deleteDoc(doc(teacher, 'quizzes/gq/teamSessions/t1/reveals/0')))
    await assertSucceeds(deleteDoc(doc(teacher, 'quizzes/gq/teamSessions/t1')))
    await assertSucceeds(deleteDoc(doc(teacher, 'quizzes/gq/teamPrivate/t1')))
    await assertSucceeds(deleteDoc(doc(teacher, 'quizzes/gq/teamCodes/ABC234')))
    await assertSucceeds(deleteDoc(doc(teacher, 'quizzes/gq/teams/t1')))
  })

  it('lets a student read only their own membership pointer', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/groupQuizTeams/gq')))
    await assertFails(getDoc(doc(as('bob'), 'users/alice/groupQuizTeams/gq')))
  })
})

describe('group quiz answer protection', () => {
  it('hides questions and answer keys of a group quiz from students, even participants', async () => {
    await assertFails(getDoc(doc(as('alice'), 'quizzes/gq/questions/q1')))
    await assertFails(getDocs(collection(as('alice'), 'quizzes/gq/questions')))
    await assertFails(getDoc(doc(as('alice'), 'quizzes/gq/answerKeys/q1')))
    await assertFails(getDoc(doc(as('bob'), 'quizzes/gq/answerKeys/q1')))
  })

  it('still lets the owner read a group quiz', async () => {
    await assertSucceeds(getDoc(doc(as('teacher'), 'quizzes/gq/questions/q1')))
    await assertSucceeds(getDoc(doc(as('teacher'), 'quizzes/gq/answerKeys/q1')))
  })

  it('keeps solo quizzes exactly as before', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'quizzes/solo/questions/q1')))
    await assertSucceeds(getDoc(doc(as('alice'), 'quizzes/solo/answerKeys/q1')))
    // Bob never started the solo quiz, so he still cannot read its answer key.
    await assertFails(getDoc(doc(as('bob'), 'quizzes/solo/answerKeys/q1')))
  })

  it('stops students from creating their own participation or attempts in a group quiz', async () => {
    const bob = as('bob')
    await assertFails(setDoc(doc(bob, 'quizzes/gq/participants/bob'), { userId: 'bob', userName: 'Bob', createdAt: new Date(), updatedAt: new Date(), attemptCount: 1, activeAttemptId: 'a1' }))
    await assertFails(setDoc(doc(bob, 'quizzes/gq/attempts/a1'), { userId: 'bob', status: 'in_progress' }))
    await assertFails(setDoc(doc(bob, 'quizzes/gq/results/a1'), { userId: 'bob', score: 100, maxScore: 100, perQuestion: {}, gradedAt: new Date() }))
  })
})

describe('group quiz settings validation', () => {
  const settingsUpdate = (path: string, participation: Record<string, unknown>) =>
    updateDoc(doc(as('teacher'), path), { settings: settings(participation), updatedAt: new Date() })

  it('accepts a full group configuration and an older document that only had groupSize', async () => {
    await assertSucceeds(settingsUpdate('quizzes/gdraft', group))
    await assertSucceeds(settingsUpdate('quizzes/gdraft', { type: 'group', groupSize: 4 }))
    await assertSucceeds(settingsUpdate('quizzes/gdraft', { ...group, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null }))
  })

  it('rejects out-of-range, unknown and malformed group settings', async () => {
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, questionTimeSec: 9 }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, questionTimeSec: 301 }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, questionTimeSec: 30.5 }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, groupSize: 11 }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, groupSize: 1 }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, answerMode: 'anyone' }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, teamFormation: 'random' }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, waitForEveryone: 'yes' }))
    await assertFails(settingsUpdate('quizzes/gdraft', { ...group, extra: true }))
  })

  it('keeps flashcard quizzes individual-only', async () => {
    await assertFails(updateDoc(doc(as('teacher'), 'quizzes/fdraft'), {
      settings: { ...settings(group), answerReveal: 'never', scoreVisibility: 'hidden' }, updatedAt: new Date(),
    }))
  })
})
