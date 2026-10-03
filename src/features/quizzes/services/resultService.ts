import { collection, getDoc, getDocs, orderBy, query, runTransaction, Timestamp, where, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseQuizResult } from '../schemas'
import type { QuizResult } from '../types'
import { resultRef } from './paths'

export async function getQuizResult(quizId: string, attemptId: string, db: Firestore = firestore): Promise<QuizResult | null> {
  const snapshot = await getDoc(resultRef(db, quizId, attemptId))
  return snapshot.exists() ? parseQuizResult(snapshot.data()) : null
}

export async function listStudentResults(quizId: string, userId: string, db: Firestore = firestore): Promise<Array<QuizResult & { id: string }>> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'results'), where('userId', '==', userId), orderBy('gradedAt', 'desc')))
  return snapshot.docs.map((item) => ({ ...parseQuizResult(item.data()), id: item.id }))
}

export async function listQuizResults(quizId: string, db: Firestore = firestore): Promise<Array<QuizResult & { id: string }>> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'results'), orderBy('gradedAt', 'desc')))
  return snapshot.docs.map((item) => ({ ...parseQuizResult(item.data()), id: item.id }))
}

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
