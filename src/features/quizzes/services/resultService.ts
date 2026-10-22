import { collection, getDoc, getDocs, orderBy, query, runTransaction, Timestamp, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseAnswerKey, parseQuestion, parseQuizAttempt, parseQuizResult } from '../schemas'
import type { QuizResult } from '../types'
import { answerKeyRef, answerKeysRef, attemptRef, attemptsRef, questionRef, questionsRef, resultRef } from './paths'
import { applyQuestionOverride, recalculateAutomaticGrade, regradeAutomaticAttempt } from '../results/resultLogic'
import type { QuizQuestionRecord } from '../grading/grade'

export async function getQuizResult(quizId: string, attemptId: string, db: Firestore = firestore): Promise<QuizResult | null> {
  const snapshot = await getDoc(resultRef(db, quizId, attemptId))
  return snapshot.exists() ? parseQuizResult(snapshot.data()) : null
}

export async function listStudentResults(quizId: string, userId: string, db: Firestore = firestore): Promise<Array<QuizResult & { id: string }>> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'results'), where('userId', '==', userId), orderBy('gradedAt', 'desc')))
  return snapshot.docs.map((item) => ({ ...parseQuizResult(item.data()), id: item.id }))
}

export async function listResults(quizId: string, db: Firestore = firestore): Promise<Array<QuizResult & { id: string }>> {
  const snapshot = await getDocs(collection(db, 'quizzes', quizId, 'results'))
  return snapshot.docs.map((item) => ({ ...parseQuizResult(item.data()), id: item.id }))
}

export const listQuizResults = listResults

export async function overrideResult(
  quizId: string,
  attemptId: string,
  overrides: Record<string, { correct: boolean; pointsAwarded: number }>,
  db: Firestore = firestore,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = resultRef(db, quizId, attemptId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists()) throw new Error('Result not found')
    const result = parseQuizResult(snapshot.data())
    const perQuestion = { ...result.perQuestion }
    for (const [questionId, override] of Object.entries(overrides)) {
      if (!perQuestion[questionId]) throw new Error(`Question ${questionId} is not in this result`)
      if (!Number.isFinite(override.pointsAwarded) || override.pointsAwarded < 0) {
        throw new Error(`Invalid awarded points for ${questionId}`)
      }
      perQuestion[questionId] = { correct: override.correct, pointsAwarded: override.pointsAwarded, overridden: true }
    }
    const score = Object.values(perQuestion).reduce((sum, item) => sum + item.pointsAwarded, 0)
    if (score > result.maxScore) throw new Error('An overridden score cannot exceed the result maximum')
    transaction.update(ref, { perQuestion, score, gradedAt: Timestamp.now() })
  })
}

export async function setQuestionGradeOverride(
  quizId: string,
  attemptId: string,
  questionId: string,
  pointsAwarded: number | null,
  db: Firestore = firestore,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const refs = [resultRef(db, quizId, attemptId), attemptRef(db, quizId, attemptId), questionRef(db, quizId, questionId), answerKeyRef(db, quizId, questionId)]
    const [resultSnapshot, attemptSnapshot, questionSnapshot, keySnapshot] = await Promise.all(refs.map((ref) => transaction.get(ref)))
    if (!resultSnapshot.exists() || !attemptSnapshot.exists() || !questionSnapshot.exists() || !keySnapshot.exists()) throw new Error('The attempt grading data could not be found')
    const result = parseQuizResult(resultSnapshot.data())
    const attempt = parseQuizAttempt(attemptSnapshot.data())
    const question = { ...parseQuestion(questionSnapshot.data()), id: questionId }
    if (attempt.status !== 'submitted' || attempt.userId !== result.userId) throw new Error('Only a submitted attempt can be regraded')
    if (question.type !== 'identification' && question.type !== 'fill_blank') throw new Error('Only typed answers can be overridden')
    const key = parseAnswerKey(keySnapshot.data())
    const next = pointsAwarded === null
      ? recalculateAutomaticGrade({ result, question, key, attempt })
      : applyQuestionOverride(result, questionId, pointsAwarded, question.points)
    transaction.update(resultRef(db, quizId, attemptId), { perQuestion: next.perQuestion, score: next.score, gradedAt: Timestamp.now() })
  })
}

export interface RegradeSummary { checked: number; updated: number }

/**
 * Regrades every submitted attempt of a quiz against the answer keys as they are NOW, so a key fix reaches
 * attempts that were graded earlier. Hand overrides, blank-board reviews and team attempts are left alone.
 * Only the quiz owner may write results (firestore.rules), and only changed results are written.
 */
export async function regradeQuizAttempts(quizId: string, db: Firestore = firestore): Promise<RegradeSummary> {
  const [questionSnapshot, keySnapshot, attemptSnapshot, resultSnapshot] = await Promise.all([
    getDocs(query(questionsRef(db, quizId), orderBy('order'))),
    getDocs(answerKeysRef(db, quizId)),
    getDocs(attemptsRef(db, quizId)),
    getDocs(collection(db, 'quizzes', quizId, 'results')),
  ])
  const questions = questionSnapshot.docs.map((item) => ({ ...parseQuestion(item.data()), id: item.id })) as QuizQuestionRecord[]
  const answerKeys = Object.fromEntries(keySnapshot.docs.map((item) => [item.id, parseAnswerKey(item.data())]))
  const results = new Map(resultSnapshot.docs.map((item) => [item.id, parseQuizResult(item.data())]))
  const updates: Array<{ attemptId: string; result: QuizResult }> = []
  let checked = 0
  for (const item of attemptSnapshot.docs) {
    const attempt = parseQuizAttempt(item.data())
    const result = results.get(item.id)
    if (attempt.status !== 'submitted' || attempt.teamId || !result) continue
    checked += 1
    const next = regradeAutomaticAttempt({ result, questions, answerKeys, attempt })
    if (next) updates.push({ attemptId: item.id, result: next })
  }
  for (let start = 0; start < updates.length; start += 400) {
    const batch = writeBatch(db)
    for (const { attemptId, result } of updates.slice(start, start + 400)) {
      batch.update(resultRef(db, quizId, attemptId), { perQuestion: result.perQuestion, score: result.score, gradedAt: Timestamp.now() })
    }
    await batch.commit()
  }
  return { checked, updated: updates.length }
}
