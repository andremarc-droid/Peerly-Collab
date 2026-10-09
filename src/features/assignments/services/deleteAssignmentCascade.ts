import { deleteDoc, getDocs, limit, query, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { assignmentRef, turnInsRef } from './paths'

const PAGE = 400

/**
 * Removes an assignment and every student's turn-in record. Students' and the instructor's Drive files are
 * never touched; only our references to them go away.
 */
export async function deleteAssignmentCascade(classId: string, assignmentId: string, db: Firestore = firestore): Promise<void> {
  const turnIns = turnInsRef(db, classId, assignmentId)
  while (true) {
    const page = await getDocs(query(turnIns, limit(PAGE)))
    if (page.empty) break
    const batch = writeBatch(db)
    page.docs.forEach((item) => batch.delete(item.ref))
    await batch.commit()
    if (page.size < PAGE) break
  }
  await deleteDoc(assignmentRef(db, classId, assignmentId))
}
