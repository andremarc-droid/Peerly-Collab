import {
  collection, doc, getDoc, getDocs, orderBy, query, runTransaction, Timestamp, updateDoc, writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { validateQuestionAnswerPair } from '../schemas'
import { parseQuiz } from '../schemas'
import { answerKeyRef, questionRef, questionsRef, quizRef } from './paths'

export async function saveQuestionAndKey(
  quizId: string,
  questionId: string | null,
  questionValue: unknown,
  answerKeyValue: unknown,
  db: Firestore = firestore,
): Promise<string> {
  const { question, answerKey } = validateQuestionAnswerPair(questionValue, answerKeyValue)
  const ref = questionId ? questionRef(db, quizId, questionId) : doc(collection(db, 'quizzes', quizId, 'questions'))
  await runTransaction(db, async (transaction) => {
    const parentRef = quizRef(db, quizId)
    const [parentSnapshot, questionSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(ref)])
    if (!parentSnapshot.exists()) throw new Error('Quiz not found')
    const parent = parseQuiz(parentSnapshot.data())
    if ((parent.mode === 'flashcards') !== (question.type === 'flashcard')) throw new Error('Question type must match the quiz format')
    transaction.set(ref, question)
    transaction.set(answerKeyRef(db, quizId, ref.id), answerKey)
    if (!questionSnapshot.exists()) transaction.update(parentRef, { questionCount: parent.questionCount + 1, updatedAt: Timestamp.now() })
  })
  return ref.id
}

export async function deleteQuestion(quizId: string, questionId: string, db: Firestore = firestore): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const parentRef = quizRef(db, quizId)
    const question = questionRef(db, quizId, questionId)
    const [parentSnapshot, questionSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(question)])
    if (!parentSnapshot.exists()) throw new Error('Quiz not found')
    const parent = parseQuiz(parentSnapshot.data())
    if (!questionSnapshot.exists()) return
    transaction.delete(question)
    transaction.delete(answerKeyRef(db, quizId, questionId))
    transaction.update(parentRef, { questionCount: Math.max(0, parent.questionCount - 1), updatedAt: Timestamp.now() })
  })
}

export async function reorderQuestions(quizId: string, orderedIds: string[], db: Firestore = firestore): Promise<void> {
  const snapshot = await getDocs(query(questionsRef(db, quizId), orderBy('order')))
  const currentIds = snapshot.docs.map(({ id }) => id)
  if (orderedIds.length !== currentIds.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !currentIds.includes(id))) {
    throw new Error('Reorder must include every question exactly once')
  }
  for (let start = 0; start < orderedIds.length; start += 400) {
    const batch = writeBatch(db)
    orderedIds.slice(start, start + 400).forEach((id, offset) => batch.update(questionRef(db, quizId, id), { order: start + offset }))
    await batch.commit()
  }
  await updateDoc(quizRef(db, quizId), { updatedAt: Timestamp.now() })
}

export async function listQuestions(quizId: string, db: Firestore = firestore) {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order')))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getQuestionWithKey(quizId: string, questionId: string, db: Firestore = firestore) {
  const [questionSnapshot, keySnapshot] = await Promise.all([
    getDoc(questionRef(db, quizId, questionId)), getDoc(answerKeyRef(db, quizId, questionId)),
  ])
  if (!questionSnapshot.exists() || !keySnapshot.exists()) return null
  const pair = validateQuestionAnswerPair(questionSnapshot.data(), keySnapshot.data())
  return { id: questionSnapshot.id, ...pair }
}
