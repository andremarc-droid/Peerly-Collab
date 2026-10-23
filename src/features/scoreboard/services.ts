import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firestore } from '../../lib/firebase/firestore'
import { functions } from '../../lib/firebase/functions'
import type { ScoreboardEntry, ScoreboardPeriod, ScoreboardRankingResult, StudyEventType } from './types'

export async function listScoreboardEntries(
  period: ScoreboardPeriod,
  maxCount = 50,
  currentUid?: string,
  db: Firestore = firestore,
): Promise<ScoreboardRankingResult> {
  const col = collection(db, 'scoreboard', period, 'entries')
  const q = query(col, orderBy('points', 'desc'), limit(maxCount))
  const snap = await getDocs(q)

  const entries: ScoreboardEntry[] = snap.docs.map((d, index) => {
    const data = d.data() as ScoreboardEntry
    return {
      ...data,
      uid: d.id,
      rank: index + 1,
    }
  })

  let userEntry: ScoreboardEntry | undefined

  if (currentUid) {
    const found = entries.find((e) => e.uid === currentUid)
    if (found) {
      userEntry = found
    } else {
      const myDoc = await getDoc(doc(db, 'scoreboard', period, 'entries', currentUid))
      if (myDoc.exists()) {
        const myData = myDoc.data() as ScoreboardEntry
        const myPoints = myData.points ?? 0
        const rankCountSnap = await getCountFromServer(
          query(col, where('points', '>', myPoints)),
        )
        const myRank = rankCountSnap.data().count + 1
        userEntry = {
          ...myData,
          uid: currentUid,
          rank: myRank,
        }
      }
    }
  }

  return { entries, userEntry }
}

export async function callRecordStudyEvent(
  eventType: StudyEventType,
  count = 1,
): Promise<{ awardedPoints: number; totalDailyPoints: number }> {
  try {
    const fn = httpsCallable<
      { eventType: StudyEventType; count: number },
      { awardedPoints: number; totalDailyPoints: number }
    >(functions, 'recordStudyEvent')
    const res = await fn({ eventType, count })
    return res.data
  } catch {
    return { awardedPoints: 0, totalDailyPoints: 0 }
  }
}

export async function callUpdateScoreboardOptIn(
  optIn: boolean,
  displayName?: string,
): Promise<{ success: boolean; optIn: boolean }> {
  const fn = httpsCallable<
    { optIn: boolean; displayName?: string },
    { success: boolean; optIn: boolean }
  >(functions, 'updateScoreboardOptIn')
  const res = await fn({ optIn, displayName })
  return res.data
}

export async function deleteUserScoreboardEntriesOnAccountDeletion(
  uid: string,
  db: Firestore = firestore,
): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'scoreboard', 'weekly', 'entries', uid)).catch(() => {}),
    deleteDoc(doc(db, 'scoreboard', 'allTime', 'entries', uid)).catch(() => {}),
  ])
}
