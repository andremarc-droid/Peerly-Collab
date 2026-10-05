import { collection, doc, getDoc, getDocs, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { parseQuiz, validateQuestionAnswerPair } from '../schemas'
import { answerKeysRef, questionsRef, quizRef } from './paths'

export async function duplicateQuiz(quizId: string, db: Firestore = firestore, classIdOverride?: string): Promise<string> {
  const sourceRef = quizRef(db, quizId)
  const sourceSnapshot = await getDoc(sourceRef)
  if (!sourceSnapshot.exists()) throw new Error('Quiz not found')
  const [questionSnapshot, keySnapshot] = await Promise.all([
    getDocs(questionsRef(db, quizId)), getDocs(answerKeysRef(db, quizId)),
  ])
  const source = parseQuiz(sourceSnapshot.data())
  const classId = classIdOverride ?? source.classId
  if (!classId) throw new Error('Assign this unassigned quiz to a class before duplicating it.')
  const copyId = doc(collection(db, 'quizzes')).id
  const copyRef = quizRef(db, copyId)
  const now = Timestamp.now()
  const copiedQuiz = { ...source, classId, title: `Copy of ${source.title}`, status: 'draft' as const, questionCount: 0, createdAt: now, updatedAt: now, publishedAt: null, settings: { ...source.settings, scoresReleased: false } }
  const keysByQuestion = new Map(keySnapshot.docs.map((key) => [key.id, key.data()]))
  const operations = questionSnapshot.docs.map((snapshot) => {
    const { id } = snapshot
    const questionRef = source.mode === 'canvas' && id === 'board'
      ? doc(db, 'quizzes', copyId, 'questions', 'board')
      : doc(collection(db, 'quizzes', copyId, 'questions'))
    const answerKey = keysByQuestion.get(id)
    if (!answerKey) throw new Error(`Missing answer key for question ${id}`)
    const pair = validateQuestionAnswerPair(snapshot.data(), answerKey)
    return { questionRef, question: pair.question, key: pair.answerKey }
  })
  const firstBatch = writeBatch(db)
  firstBatch.set(copyRef, copiedQuiz)
  await firstBatch.commit()
  for (let start = 0; start < operations.length; start += 200) {
    const batch = writeBatch(db)
    for (const item of operations.slice(start, start + 200)) {
      batch.set(item.questionRef, item.question)
      if (item.key) batch.set(doc(db, 'quizzes', copyId, 'answerKeys', item.questionRef.id), item.key)
    }
    await batch.commit()
  }
  if (questionSnapshot.size > 0) await updateDoc(copyRef, { questionCount: questionSnapshot.size, updatedAt: Timestamp.now() })
  return copyId
}
