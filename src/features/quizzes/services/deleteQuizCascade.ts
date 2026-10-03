import { collection, deleteDoc, getDocs, limit, query, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { quizRef } from './paths'

const childCollections = ['questions', 'answerKeys', 'participants', 'attempts', 'results'] as const

export async function countQuizAttempts(quizId: string, db: Firestore = firestore): Promise<number> {
  const snapshot = await getDocs(query(collection(db, 'quizzes', quizId, 'attempts'), where('status', '==', 'submitted')))
  return snapshot.size
}

export async function deleteQuizCascade(quizId: string, db: Firestore = firestore): Promise<void> {
  for (const child of childCollections) {
    const path = collection(db, 'quizzes', quizId, child)
    while (true) {
      const page = await getDocs(query(path, limit(400)))
      if (page.empty) break
      const batch = writeBatch(db)
      page.docs.forEach((document) => batch.delete(document.ref))
      await batch.commit()
      if (page.size < 400) break
    }
  }
  await deleteDoc(quizRef(db, quizId))
}
