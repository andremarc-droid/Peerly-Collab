import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction, Timestamp, updateDoc, writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { validateQuestionAnswerPair } from '../schemas'
import { parseQuiz } from '../schemas'
import { answerKeyRef, questionRef, questionsRef, quizRef } from './paths'

function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (Object.prototype.toString.call(value) === '[object Object]' && (value.constructor === Object || !value.constructor)) {
    const res: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        res[k] = stripUndefined(v)
      }
    }
    return res as T
  }
  return value
}

export async function saveQuestionAndKey(
  quizId: string,
  questionId: string | null,
  questionValue: unknown,
  answerKeyValue: unknown,
  optionsOrDb?: { allowLegacyImages?: boolean; boardKind?: 'prebuilt' | 'blank' } | Firestore,
  dbArg?: Firestore,
): Promise<string> {
  const isOptions = typeof optionsOrDb === 'object' && optionsOrDb !== null && ('allowLegacyImages' in optionsOrDb || 'boardKind' in optionsOrDb)
  const options = isOptions ? (optionsOrDb as { allowLegacyImages?: boolean; boardKind?: 'prebuilt' | 'blank' }) : undefined
  const db: Firestore = (isOptions ? dbArg : (optionsOrDb as Firestore | undefined)) ?? firestore
  const ref = questionId ? questionRef(db, quizId, questionId) : doc(collection(db, 'quizzes', quizId, 'questions'))
  await runTransaction(db, async (transaction) => {
    const parentRef = quizRef(db, quizId)
    const [parentSnapshot, questionSnapshot] = await Promise.all([transaction.get(parentRef), transaction.get(ref)])
    if (!parentSnapshot.exists()) throw new Error('Quiz not found')
    const parent = parseQuiz(parentSnapshot.data())
    const boardKind = options?.boardKind ?? parent.boardKind
    const { question, answerKey } = validateQuestionAnswerPair(questionValue, answerKeyValue, {
      allowLegacyImages: options?.allowLegacyImages,
      boardKind,
    })
    const matchesMode =
      (parent.mode === 'flashcards' && question.type === 'flashcard') ||
      (parent.mode === 'canvas' && question.type === 'canvas') ||
      (parent.mode === 'quiz' && question.type !== 'flashcard' && question.type !== 'canvas')
    if (!matchesMode) throw new Error('Question type must match the quiz format')
    transaction.set(ref, stripUndefined(question))
    if (answerKey !== null) {
      transaction.set(answerKeyRef(db, quizId, ref.id), stripUndefined(answerKey))
    }
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
  const [questionSnapshot, keySnapshot, quizSnapshot] = await Promise.all([
    getDoc(questionRef(db, quizId, questionId)),
    getDoc(answerKeyRef(db, quizId, questionId)),
    getDoc(quizRef(db, quizId)),
  ])
  if (!questionSnapshot.exists()) return null
  const quiz = quizSnapshot.exists() ? parseQuiz(quizSnapshot.data()) : null
  const isBlankCanvas = quiz?.mode === 'canvas' && quiz?.boardKind === 'blank'
  if (!isBlankCanvas && !keySnapshot.exists()) return null
  const pair = validateQuestionAnswerPair(
    questionSnapshot.data(),
    isBlankCanvas ? null : keySnapshot.data(),
    { allowLegacyImages: true, boardKind: quiz?.boardKind },
  )
  return { id: questionSnapshot.id, ...pair }
}

export type SavedQuestion = NonNullable<Awaited<ReturnType<typeof getQuestionWithKey>>>

export function watchQuestionPairs(
  quizId: string,
  onChange: (questions: SavedQuestion[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(query(questionsRef(db, quizId), orderBy('order')), (snapshot) => {
    void Promise.all(snapshot.docs.map((item) => getQuestionWithKey(quizId, item.id, db)))
      .then((questions) => {
        if (questions.some((question) => !question)) throw new Error('A question is missing its answer key.')
        onChange(questions as SavedQuestion[])
      })
      .catch((reason: unknown) => onError(reason instanceof Error ? reason : new Error('Could not load question answers.')))
  }, onError)
}
