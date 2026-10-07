import { deleteDoc, onSnapshot, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { cleanDisplayName } from './memberService'
import { presenceCollectionRef, presenceRef } from './paths'
import { parsePresence } from './schemas'
import type { CursorPosition, PresenceRecord } from './types'

interface PresenceWrite {
  uid: string
  name: string
  online: boolean
  cursor: CursorPosition | null
}

const COORD_LIMIT = 100_000

/** Keeps cursors inside what the rules accept, so one wild value cannot make a heartbeat fail. */
function safeCursor(cursor: CursorPosition | null): CursorPosition | null {
  if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return null
  const clamp = (n: number) => Math.round(Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, n)))
  return { x: clamp(cursor.x), y: clamp(cursor.y) }
}

/** One document per person. Every write is a full replacement stamped by the server clock. */
export async function writePresence(
  classId: string,
  canvasId: string,
  { uid, name, online, cursor }: PresenceWrite,
  db: Firestore = firestore,
): Promise<void> {
  await setDoc(presenceRef(db, classId, canvasId, uid), {
    uid,
    name: cleanDisplayName(name),
    online,
    cursor: online ? safeCursor(cursor) : null,
    lastActive: serverTimestamp(),
  })
}

export async function clearPresence(
  classId: string,
  canvasId: string,
  uid: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(presenceRef(db, classId, canvasId, uid))
}

export function watchPresence(
  classId: string,
  canvasId: string,
  onChange: (presence: Map<string, PresenceRecord>) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    presenceCollectionRef(db, classId, canvasId),
    (snap) => {
      const map = new Map<string, PresenceRecord>()
      for (const d of snap.docs) {
        // "estimate" fills in the server time for a write that is still in flight.
        const record = parsePresence(d.id, d.data({ serverTimestamps: 'estimate' }))
        if (record) map.set(record.uid, record)
      }
      onChange(map)
    },
    onError,
  )
}
