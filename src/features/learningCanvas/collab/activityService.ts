import {
  addDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { ACTIVITY_PAGE_SIZE, MAX_ACTIVITY_CHANGES, MAX_ACTIVITY_LINE, MAX_ACTIVITY_SUMMARY } from './constants'
import { cleanDisplayName } from './memberService'
import { activityRef } from './paths'
import { parseActivity } from './schemas'
import type { ActivityRecord, ActivityType } from './types'

export interface ActivityActor {
  uid: string
  name: string
}

export interface ActivityEntry {
  type: ActivityType
  summary: string
  changes?: string[]
}

/** Appends one entry. The rules make the log append-only, so nobody can rewrite history afterwards. */
export async function logActivity(
  classId: string,
  canvasId: string,
  actor: ActivityActor,
  entry: ActivityEntry,
  db: Firestore = firestore,
): Promise<void> {
  const summary = entry.summary.slice(0, MAX_ACTIVITY_SUMMARY)
  if (!summary) return
  await addDoc(activityRef(db, classId, canvasId), {
    actorId: actor.uid,
    actorName: cleanDisplayName(actor.name),
    type: entry.type,
    summary,
    changes: (entry.changes ?? []).slice(0, MAX_ACTIVITY_CHANGES).map((line) => line.slice(0, MAX_ACTIVITY_LINE)),
    createdAt: serverTimestamp(),
  })
}

/** Newest first. Entries still waiting for the server clock are shown immediately with an estimated time. */
export function watchActivity(
  classId: string,
  canvasId: string,
  onChange: (items: ActivityRecord[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    query(activityRef(db, classId, canvasId), orderBy('createdAt', 'desc'), limit(ACTIVITY_PAGE_SIZE)),
    (snap) => {
      onChange(
        snap.docs
          .map((d) => parseActivity(d.id, d.data({ serverTimestamps: 'estimate' })))
          .filter((item): item is ActivityRecord => item !== null),
      )
    },
    onError,
  )
}
