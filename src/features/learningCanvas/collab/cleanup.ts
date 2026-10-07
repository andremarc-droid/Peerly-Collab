import { FirebaseError } from 'firebase/app'
import { collection, getDocs, limit, query, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { CANVAS_SUBCOLLECTIONS } from './paths'

const PAGE = 100

/**
 * Empties members, invites, presence and activity so a deleted canvas leaves nothing behind.
 *
 * A class owner cleaning up a student's personal canvas is not allowed to read those collections
 * (a personal canvas stays private from the instructor), so a permission error there is skipped
 * rather than failing the whole class deletion.
 */
export async function deleteCanvasSubcollections(
  classId: string,
  canvasId: string,
  db: Firestore = firestore,
): Promise<void> {
  for (const name of CANVAS_SUBCOLLECTIONS) {
    const path = collection(db, 'classes', classId, 'learningCanvases', canvasId, name)
    try {
      while (true) {
        const page = await getDocs(query(path, limit(PAGE)))
        if (page.empty) break
        const batch = writeBatch(db)
        page.docs.forEach((item) => batch.delete(item.ref))
        await batch.commit()
        if (page.size < PAGE) break
      }
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'permission-denied') continue
      throw error
    }
  }
}
