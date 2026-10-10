import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { localDayKey, emptyProgress, parseDeckProgress, type DeckProgress } from './progress'
import { parseTestAttempt, type TestAttempt } from './practiceTest'

export async function loadProgress(uid: string, deckKey: string, db: Firestore = firestore): Promise<DeckProgress> {
  const snap = await getDoc(doc(db, 'users', uid, 'deckProgress', deckKey))
  const today = localDayKey(new Date())
  return parseDeckProgress(snap.exists() ? snap.data() : emptyProgress(today), today)
}
export async function saveProgress(uid: string, deckKey: string, progress: DeckProgress, db: Firestore = firestore): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'deckProgress', deckKey), progress)
}
export function watchDeckProgress(uid: string, deckKeys: string[], onChange: (values: Record<string, DeckProgress>) => void, onError: (e: Error) => void, db: Firestore = firestore) {
  const values: Record<string, DeckProgress> = {}; const stops = deckKeys.map(key => onSnapshot(doc(db, 'users', uid, 'deckProgress', key), snap => { values[key] = parseDeckProgress(snap.exists() ? snap.data() : null, localDayKey(new Date())); onChange({ ...values }) }, onError))
  return () => stops.forEach(stop => stop())
}
export async function saveAttempt(uid: string, attempt: TestAttempt, attemptId?: string, db: Firestore = firestore): Promise<string> {
  const ref = attemptId
    ? doc(db, 'users', uid, 'studyAttempts', attemptId)
    : doc(collection(db, 'users', uid, 'studyAttempts'))
  await setDoc(ref, attempt)
  const old = await getDocs(query(collection(db, 'users', uid, 'studyAttempts'), where('deckKey', '==', attempt.deckKey), orderBy('createdAt', 'desc'), limit(40)))
  await Promise.all(old.docs.slice(30).map(item => deleteDoc(item.ref)))
  return ref.id
}
export async function listAttempts(uid: string, deckKey: string, db: Firestore = firestore): Promise<TestAttempt[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'studyAttempts'), where('deckKey', '==', deckKey), orderBy('createdAt', 'desc'), limit(20)))
  return snap.docs.flatMap(item => { const value = parseTestAttempt(item.data()); return value ? [value] : [] })
}
