import { onSnapshot, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { tutorPresenceCollectionRef, tutorPresenceRef } from './sharedPaths'

export interface TutorPresence {
  uid: string
  name: string
  online: boolean
}

export async function writeTutorPresence(
  threadId: string,
  uid: string,
  name: string,
  online: boolean,
  db: Firestore = firestore,
): Promise<void> {
  await setDoc(tutorPresenceRef(db, threadId, uid), {
    uid,
    name: name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner',
    online,
    lastActive: serverTimestamp(),
  })
}

export function watchTutorPresence(
  threadId: string,
  onChange: (people: TutorPresence[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(tutorPresenceCollectionRef(db, threadId), (snap) => {
    onChange(snap.docs.flatMap((item) => {
      const data = item.data()
      if (typeof data.name !== 'string' || typeof data.online !== 'boolean') return []
      const lastActive = data.lastActive instanceof Timestamp ? data.lastActive.toMillis() : 0
      const fresh = lastActive > 0 && Date.now() - lastActive < 90_000
      return [{ uid: item.id, name: data.name.slice(0, 80), online: data.online && fresh }]
    }))
  }, onError)
}
