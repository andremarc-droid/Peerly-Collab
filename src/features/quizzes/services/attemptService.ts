import {
  collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseAnswerKey, parseQuestion, parseQuiz, parseQuizAttempt, parseQuizParticipant } from '../schemas'
import type { QuizAttempt, QuizQuestion, QuizResult, SubmittedAnswer } from '../types'
import { gradeAttempt } from '../grading/grade'
import { describeWindow, quizWindowState } from '../quizTiming'
import { answerKeysRef, attemptRef, participantRef, questionsRef, quizRef, resultRef } from './paths'

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export async function startAttempt(quizId: string, userId: string, userName: string, db: Firestore = firestore): Promise<string> {
  const attempt = doc(collection(db, 'quizzes', quizId, 'attempts'))
  const participant = participantRef(db, quizId, userId)
  const questionSnapshot = await getDocs(query(questionsRef(db, quizId), orderBy('order')))
  const questions = questionSnapshot.docs.map((item) => ({ id: item.id, question: parseQuestion(item.data()) }))
  await runTransaction(db, async (transaction) => {
    const [parent, participantSnapshot] = await Promise.all([transaction.get(quizRef(db, quizId)), transaction.get(participant)])
    if (!parent.exists()) throw new Error('Quiz not found')
    const quiz = parseQuiz(parent.data())
    if (quiz.status !== 'published') throw new Error('Only published quizzes can be started')
    if (quiz.settings.participation.type !== 'individual') throw new Error('Group quizzes are played with your team.')
    const windowState = quizWindowState(quiz.settings, Date.now())
    if (windowState === 'not_open_yet') throw new Error(`This quiz is not open yet. ${describeWindow(quiz.settings) ?? ''}`.trim())
    if (windowState === 'closed') throw new Error(`The deadline for this quiz has passed. ${describeWindow(quiz.settings) ?? ''}`.trim())
    if (questions.length === 0) throw new Error('This quiz has no questions')
    const priorParticipant = participantSnapshot.exists() ? parseQuizParticipant(participantSnapshot.data()) : null
    const attemptCount = priorParticipant?.attemptCount ?? 0
    if (priorParticipant?.activeAttemptId) throw new Error('You already have an attempt in progress')
    if (quiz.settings.attemptsAllowed !== null && attemptCount >= quiz.settings.attemptsAllowed) throw new Error('No attempts remain for this quiz')
    const ordered = quiz.settings.shuffleQuestions ? shuffle(questions) : questions
    const optionOrder: QuizAttempt['optionOrder'] = {}
    for (const { id, question } of ordered) {
      if ('options' in question) optionOrder[id] = quiz.settings.shuffleOptions ? shuffle(question.options).map(({ id: optionId }) => optionId) : question.options.map(({ id: optionId }) => optionId)
    }
    const next = {
      userId, userName, attemptNumber: attemptCount + 1, status: 'in_progress' as const, answers: {},
      questionOrder: ordered.map(({ id }) => id), optionOrder, startedAt: serverTimestamp(), submittedAt: null, timeSpentSeconds: 0,
    }
    transaction.set(attempt, next)
    transaction.set(participant, {
      userId, userName, createdAt: priorParticipant?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp(),
      attemptCount: attemptCount + 1, activeAttemptId: attempt.id,
    })
  })
  return attempt.id
}

export async function autosaveAnswers(
  quizId: string,
  attemptId: string,
  answerPatch: Record<string, SubmittedAnswer>,
  db: Firestore = firestore,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = attemptRef(db, quizId, attemptId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Attempt not found')
    const attempt = parseQuizAttempt(snapshot.data())
    if (attempt.status !== 'in_progress') throw new Error('Submitted attempts cannot be changed')
    const answers = { ...attempt.answers, ...answerPatch }
    if (Object.keys(answers).length > 200) throw new Error('Answers map cannot exceed 200 items')
    transaction.update(ref, { answers })
  })
}

/** Remembers which question a timed attempt is on and when its countdown started, so a refresh cannot restart the clock. */
export async function saveQuestionTimer(quizId: string, attemptId: string, index: number, startedAtMs: number, db: Firestore = firestore): Promise<void> {
  if (!Number.isInteger(index) || index < 0) throw new Error('index must be a non-negative integer')
  if (!Number.isFinite(startedAtMs)) throw new Error('startedAtMs must be a finite number')
  // The server clock offset can be fractional; rules and the schema expect whole milliseconds.
  await updateDoc(attemptRef(db, quizId, attemptId), { questionTimer: { index, startedAtMs: Math.round(startedAtMs) } })
}

export async function submitAttempt(quizId: string, attemptId: string, timeSpentSeconds?: number, db: Firestore = firestore) {
  if (timeSpentSeconds !== undefined && (!Number.isInteger(timeSpentSeconds) || timeSpentSeconds < 0)) throw new Error('timeSpentSeconds must be a non-negative integer')
  const [questionSnapshot, keySnapshot] = await Promise.all([
    getDocs(query(questionsRef(db, quizId), orderBy('order'))), getDocs(answerKeysRef(db, quizId)),
  ])
  const questions = questionSnapshot.docs.map((item) => ({ id: item.id, ...parseQuestion(item.data()) })) as (QuizQuestion & { id: string })[]
  const answerKeys = Object.fromEntries(keySnapshot.docs.map((item) => [item.id, parseAnswerKey(item.data())]))
  return runTransaction(db, async (transaction) => {
    const ref = attemptRef(db, quizId, attemptId)
    const [attemptSnapshot, parentSnapshot] = await Promise.all([transaction.get(ref), transaction.get(quizRef(db, quizId))])
    if (!attemptSnapshot.exists() || !parentSnapshot.exists()) throw new Error('Attempt or quiz not found')
    const attempt = parseQuizAttempt(attemptSnapshot.data())
    const quiz = parseQuiz(parentSnapshot.data())
    if (attempt.status !== 'in_progress') throw new Error('Attempt is already submitted')
    const participant = participantRef(db, quizId, attempt.userId)
    const participantSnapshot = await transaction.get(participant)
    if (!participantSnapshot.exists()) throw new Error('Participant record not found')
    const participantData = parseQuizParticipant(participantSnapshot.data())
    if (participantData.activeAttemptId !== attemptId) throw new Error('Attempt is no longer active')
    const serverElapsed = attempt.startedAt ? Math.max(0, Math.floor((Date.now() - attempt.startedAt.toMillis()) / 1000)) : 0
    const spentSeconds = attempt.startedAt ? serverElapsed : (timeSpentSeconds ?? 0)
    const isBlankCanvas = quiz.mode === 'canvas' && quiz.boardKind === 'blank'
    let graded: QuizResult
    if (isBlankCanvas) {
      const boardQuestion = questions.find((q) => q.type === 'canvas') ?? questions[0]
      const maxScore = boardQuestion?.points ?? 0
      graded = {
        userId: attempt.userId,
        score: 0,
        maxScore,
        perQuestion: {},
        gradedAt: Timestamp.now(),
        reviewStatus: 'pending',
      }
    } else {
      graded = gradeAttempt({ userId: attempt.userId, questions, answerKeys, answers: attempt.answers as Record<string, string | string[]>, gradedAt: Timestamp.now() })
    }
    const next = { ...attempt, status: 'submitted' as const, submittedAt: Timestamp.now(), timeSpentSeconds: spentSeconds }
    transaction.update(ref, { status: next.status, submittedAt: serverTimestamp(), timeSpentSeconds: spentSeconds })
    transaction.update(participant, { activeAttemptId: null, updatedAt: serverTimestamp() })
    transaction.set(resultRef(db, quizId, attemptId), graded)
    return { attempt: next, result: graded, scoreVisibility: quiz.settings.scoreVisibility }
  })
}

export async function getAttempt(quizId: string, attemptId: string, db: Firestore = firestore): Promise<QuizAttempt | null> {
  const snapshot = await getDoc(attemptRef(db, quizId, attemptId))
  return snapshot.exists() ? parseQuizAttempt(snapshot.data()) : null
}

export async function listUserAttempts(quizId: string, userId: string, db: Firestore = firestore): Promise<Array<QuizAttempt & { id: string }>> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'attempts'), where('userId', '==', userId), orderBy('startedAt', 'desc')))
  return snapshot.docs.map((item) => ({ ...parseQuizAttempt(item.data()), id: item.id }))
}

export async function listQuizAttempts(quizId: string, db: Firestore = firestore): Promise<Array<QuizAttempt & { id: string }>> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'attempts'), orderBy('startedAt', 'desc')))
  return snapshot.docs.map((item) => ({ ...parseQuizAttempt(item.data()), id: item.id }))
}

export async function hasQuizAttemptsOrParticipants(quizId: string, db: Firestore = firestore): Promise<boolean> {
  const [attSnap, partSnap, teamsSnap, sessionsSnap] = await Promise.all([
    getDocs(query(collection(db, 'quizzes', quizId, 'attempts'), limit(1))),
    getDocs(query(collection(db, 'quizzes', quizId, 'participants'), limit(1))),
    getDocs(query(collection(db, 'quizzes', quizId, 'teams'), limit(1))),
    getDocs(query(collection(db, 'quizzes', quizId, 'teamSessions'), limit(1))),
  ])
  return !attSnap.empty || !partSnap.empty || !teamsSnap.empty || !sessionsSnap.empty
}
