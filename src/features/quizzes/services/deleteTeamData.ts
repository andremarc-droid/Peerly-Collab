import { collection, doc, getDocs, limit, query, writeBatch, type DocumentReference, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'

const PAGE = 100

/**
 * Removes everything a group quiz stored about its teams. Only the quiz owner may delete these documents and the rules
 * deny reading teamPrivate, teamCodes and teamMeta, so the ids are taken from the team list instead of being listed.
 * Safe to run again after a failure. Run it BEFORE the quiz document is deleted (the delete rules look the quiz up).
 */
export async function deleteTeamData(quizId: string, db: Firestore = firestore): Promise<void> {
  const teams = collection(db, 'quizzes', quizId, 'teams')
  while (true) {
    const page = await getDocs(query(teams, limit(PAGE)))
    if (page.empty) break
    for (const team of page.docs) {
      const refs: DocumentReference[] = []
      const reveals = await getDocs(collection(db, 'quizzes', quizId, 'teamSessions', team.id, 'reveals'))
      reveals.docs.forEach(item => refs.push(item.ref))
      refs.push(doc(db, 'quizzes', quizId, 'teamSessions', team.id))
      refs.push(doc(db, 'quizzes', quizId, 'teamPrivate', team.id))
      const code: unknown = team.get('code')
      if (typeof code === 'string' && code.length > 0) refs.push(doc(db, 'quizzes', quizId, 'teamCodes', code))
      refs.push(team.ref)
      for (let start = 0; start < refs.length; start += 400) {
        const batch = writeBatch(db)
        refs.slice(start, start + 400).forEach(ref => batch.delete(ref))
        await batch.commit()
      }
    }
    if (page.size < PAGE) break
  }
  const meta = writeBatch(db)
  meta.delete(doc(db, 'quizzes', quizId, 'teamMeta', 'summary'))
  await meta.commit()
}
