import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { deleteModuleCascade } from '../../modules/services'
import { deleteAssignmentCascade } from '../../assignments/services/deleteAssignmentCascade'
import { deleteCanvasSubcollections } from '../../learningCanvas/collab/cleanup'
import { deleteQuizCascade } from '../../quizzes/services/deleteQuizCascade'
import { parseClass } from '../schemas'
import { classCodeRef, classRef, enrollmentsRef } from './paths'

export async function deleteClassCascade(classId: string, db: Firestore = firestore): Promise<void> {
  const classSnapshot = await getDoc(classRef(db, classId))
  if (!classSnapshot.exists()) return
  const classData = parseClass(classSnapshot.data())
  while (true) {
    const modulePage = await getDocs(query(collection(db, 'classes', classId, 'modules'), limit(100)))
    if (modulePage.empty) break
    for (const module of modulePage.docs) await deleteModuleCascade(classId, module.id, db)
  }
  while (true) {
    const assignmentPage = await getDocs(query(collection(db, 'classes', classId, 'assignments'), limit(100)))
    if (assignmentPage.empty) break
    for (const assignment of assignmentPage.docs) await deleteAssignmentCascade(classId, assignment.id, db)
  }
  while (true) {
    const canvasPage = await getDocs(query(collection(db, 'classes', classId, 'learningCanvases'), limit(100)))
    if (canvasPage.empty) break
    for (const canvasDoc of canvasPage.docs) await deleteCanvasSubcollections(classId, canvasDoc.id, db)
    const batch = writeBatch(db)
    for (const canvasDoc of canvasPage.docs) {
      batch.delete(doc(db, 'classes', classId, 'learningCanvases', canvasDoc.id, 'content', 'main'))
      batch.delete(canvasDoc.ref)
    }
    await batch.commit()
    if (canvasPage.size < 100) break
  }
  while (true) {
    const deckPage = await getDocs(query(collection(db, 'classes', classId, 'flashcardDecks'), limit(100)))
    if (deckPage.empty) break
    const batch = writeBatch(db)
    deckPage.docs.forEach((deckDoc) => batch.delete(deckDoc.ref))
    await batch.commit()
    if (deckPage.size < 100) break
  }
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
