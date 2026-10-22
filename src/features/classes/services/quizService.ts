import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { duplicateQuiz } from '../../quizzes/services/duplicateQuiz'
import { parseQuiz } from '../../quizzes/schemas'
import { getQuiz, updateQuiz, type QuizRecord } from '../../quizzes/services/quizService'
import { parseClass } from '../schemas'

function quizCollection(db: Firestore) { return collection(db, 'quizzes') }

const asClassQuizRecord = (id: string, value: unknown): QuizRecord | null => {
  try {
    const raw = value as { mode?: unknown } | null
    if (raw?.mode === 'canvas') return null
    return { ...parseQuiz(value), id }
  } catch {
    return null
  }
}

export async function assignQuizToClass(quizId: string, classId: string, db: Firestore = firestore): Promise<void> {
  const quiz = await getQuiz(quizId, db)
  if (!quiz) throw new Error('Quiz not found.')
  if (quiz.status !== 'draft') throw new Error('Only draft quizzes can be assigned to another class.')
  await updateQuiz(quizId, { classId }, db)
}

export async function copyQuizToClass(quizId: string, classId: string, db: Firestore = firestore): Promise<string> {
  const [quiz, targetSnapshot] = await Promise.all([getQuiz(quizId, db), getDoc(doc(db, 'classes', classId))])
  if (!quiz) throw new Error('Quiz not found.')
  if (!targetSnapshot.exists()) throw new Error('Target class not found.')
  const target = parseClass(targetSnapshot.data())
  if (quiz.ownerId !== target.ownerId) throw new Error('Copy the quiz into a class that you own.')
  if (target.status !== 'active') throw new Error('Copy the quiz into an active class.')
  return duplicateQuiz(quizId, db, classId)
}

export async function listQuizzesForClass(classId: string, ownerId: string, db: Firestore = firestore): Promise<QuizRecord[]> {
  const result = await getDocs(query(quizCollection(db), where('ownerId', '==', ownerId), where('classId', '==', classId), orderBy('updatedAt', 'desc')))
  return result.docs.map((item) => asClassQuizRecord(item.id, item.data())).filter((item): item is QuizRecord => item !== null)
}

export function watchQuizzesForClass(classId: string, ownerId: string, onChange: (items: QuizRecord[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(quizCollection(db), where('ownerId', '==', ownerId), where('classId', '==', classId), orderBy('updatedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => asClassQuizRecord(item.id, item.data())).filter((item): item is QuizRecord => item !== null)), onError)
}

export async function listPublishedQuizzesForClass(classId: string, db: Firestore = firestore): Promise<QuizRecord[]> {
  const result = await getDocs(query(quizCollection(db), where('classId', '==', classId), where('status', '==', 'published'), orderBy('publishedAt', 'desc')))
  return result.docs.map((item) => asClassQuizRecord(item.id, item.data())).filter((item): item is QuizRecord => item !== null)
}

export function watchPublishedQuizzesForClass(classId: string, onChange: (items: QuizRecord[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(quizCollection(db), where('classId', '==', classId), where('status', '==', 'published'), orderBy('publishedAt', 'desc')),
    (snapshot) => onChange(snapshot.docs.map((item) => asClassQuizRecord(item.id, item.data())).filter((item): item is QuizRecord => item !== null)), onError)
}

export async function countClassQuizzes(classId: string, ownerId: string, db: Firestore = firestore): Promise<number> {
  const items = await listQuizzesForClass(classId, ownerId, db)
  return items.length
}
