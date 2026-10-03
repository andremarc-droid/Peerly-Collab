import { collection, deleteDoc, getDoc, getDocs, limit, query, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { deleteQuizCascade } from '../../quizzes/services/deleteQuizCascade'
import { parseClass } from '../schemas'
import { classCodeRef, classRef, enrollmentsRef } from './paths'

export async function deleteClassCascade(classId: string, db: Firestore = firestore): Promise<void> {
  const classSnapshot = await getDoc(classRef(db, classId))
  if (!classSnapshot.exists()) return
  const classData = parseClass(classSnapshot.data())
  while (true) {
    const enrollmentPage = await getDocs(query(enrollmentsRef(db), where('ownerId', '==', classData.ownerId), where('classId', '==', classId), limit(400)))
    if (enrollmentPage.empty) break
    const batch = writeBatch(db)
    enrollmentPage.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
    if (enrollmentPage.size < 400) break
  }
  while (true) {
    const quizPage = await getDocs(query(collection(db, 'quizzes'), where('ownerId', '==', classData.ownerId), where('classId', '==', classId), limit(100)))
    if (quizPage.empty) break
    for (const item of quizPage.docs) await deleteQuizCascade(item.id, db)
  }
  await deleteDoc(classCodeRef(db, classData.joinCode))
  await deleteDoc(classRef(db, classId))
}
