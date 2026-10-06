import {
  collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, Timestamp, where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseAnswerKey, parseQuestion, parseQuiz, parseQuizAttempt, parseQuizParticipant } from '../schemas'
import type { QuizAttempt, QuizQuestion, QuizResult, SubmittedAnswer } from '../types'
import { gradeAttempt } from '../grading/grade'
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
    if (quiz.settings.participation.type !== 'individual') throw new Error('Group quizzes are coming soon.')
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
    const computedTimeSpent = attempt.startedAt ? Math.max(0, Math.floor((Date.now() - attempt.startedAt.toMillis()) / 1000)) : (timeSpentSeconds ?? 0)
    const spentSeconds = timeSpentSeconds ?? computedTimeSpent
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
