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
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { callServer } from '../../lib/firebase/callServer'
import { computeCompetitionRanks } from './schemas'
import type { ScoreboardEntry, ScoreboardPeriod, ScoreboardRankingResult } from './types'

export async function listScoreboardEntries(
  period: ScoreboardPeriod,
  maxCount = 50,
  currentUid?: string,
  db: Firestore = firestore,
): Promise<ScoreboardRankingResult> {
  const col = collection(db, 'scoreboard', period, 'entries')
  const q = query(
    col,
    orderBy('points', 'desc'),
    orderBy('displayName', 'asc'),
    limit(maxCount),
  )
  const snap = await getDocs(q)

  const rawEntries: ScoreboardEntry[] = snap.docs.map((d) => {
    const data = d.data() as ScoreboardEntry
    return {
      ...data,
      uid: d.id,
      points: data.points ?? 0,
      displayName: data.displayName || 'Peerly Learner',
    }
  })

  const entries: ScoreboardEntry[] = computeCompetitionRanks(rawEntries)

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
          points: myPoints,
          displayName: myData.displayName || 'Peerly Learner',
          rank: myRank,
        }
      }
    }
  }

  return { entries, userEntry }
}

export async function recordScoreboardNoticeSeen(
  uid: string,
  db: Firestore = firestore,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    scoreboardNoticeSeenAt: serverTimestamp(),
  })
}

export async function callEnsureScoreboardEntry(): Promise<{ optIn: boolean; created?: boolean }> {
  try {
    return await callServer<void, { optIn: boolean; created?: boolean }>('ensureScoreboardEntry', undefined)
  } catch {
    return { optIn: true }
  }
}

export async function callUpdateScoreboardOptIn(
  optIn: boolean,
  displayName?: string,
): Promise<{ success: boolean; optIn: boolean }> {
  return callServer<{ optIn: boolean; displayName?: string }, { success: boolean; optIn: boolean }>('updateScoreboardOptIn', { optIn, displayName })
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
