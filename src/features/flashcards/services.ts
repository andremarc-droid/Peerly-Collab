import {
  deleteDoc,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  where,
  type Firestore,
  type CollectionReference,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { flashcardDeckRef, flashcardDecksRef } from './paths'
import { cleanDeckText, parseFlashcardDeck, prepareCards } from './schemas'
import type {
  FlashcardDeckInput,
  FlashcardDeckKind,
  FlashcardDeckRecord,
  FlashcardDeckWithId,
} from './types'

export function sortDecksByUpdated(decks: FlashcardDeckWithId[]): FlashcardDeckWithId[] {
  return [...decks].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
}

/** Skips documents that fail validation so one bad deck cannot hide the rest. */
function toDecks(docs: Array<QueryDocumentSnapshot<FlashcardDeckRecord>>): FlashcardDeckWithId[] {
  const decks: FlashcardDeckWithId[] = []
  for (const snap of docs) {
    try {
      decks.push({ ...parseFlashcardDeck(snap.data()), id: snap.id })
    } catch {
      // Ignore malformed decks.
    }
  }
  return sortDecksByUpdated(decks)
}

/** Instructor decks for a class. Students only receive published ones (matches the rules). */
export function watchClassDecks(
  classId: string,
  role: 'instructor' | 'student',
  onChange: (decks: FlashcardDeckWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const base = flashcardDecksRef(db, classId)
  const q =
    role === 'student'
      ? query(base, where('kind', '==', 'class'), where('status', '==', 'published'))
      : query(base, where('kind', '==', 'class'))
  return onSnapshot(q, (snap) => onChange(toDecks(snap.docs)), onError)
}

/** A student's own private decks for a class. */
export function watchMyDecks(
  classId: string,
  uid: string,
  onChange: (decks: FlashcardDeckWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const q = query(
    flashcardDecksRef(db, classId),
    where('kind', '==', 'personal'),
    where('ownerId', '==', uid),
  )
  return onSnapshot(q, (snap) => onChange(toDecks(snap.docs)), onError)
}

/** Watches only the signed-in user's personal decks across all class partitions. */
export function watchMyDecksAcrossClasses(
  uid: string,
  onChange: (decks: FlashcardDeckWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const base = collectionGroup(db, 'flashcardDecks') as CollectionReference<FlashcardDeckRecord>
  const q = query(
    base,
    where('kind', '==', 'personal'),
    where('ownerId', '==', uid),
  )
  return onSnapshot(q, (snap) => onChange(toDecks(snap.docs)), onError)
}

export async function createDeck(
  classId: string,
  ownerId: string,
  kind: FlashcardDeckKind,
  input: FlashcardDeckInput,
  db: Firestore = firestore,
): Promise<string> {
  const ref = doc(flashcardDecksRef(db, classId))
  const cards = prepareCards(input.cards)
  const { title, description } = cleanDeckText(input.title, input.description)
  const now = Timestamp.now()

  const deck = parseFlashcardDeck({
    ownerId,
    classId,
    kind,
    title,
    description,
    status: kind === 'personal' ? 'private' : input.published ? 'published' : 'draft',
    cardCount: cards.length,
    cards,
    createdAt: now,
    updatedAt: now,
  })
  await setDoc(ref, deck)
  return ref.id
}

export async function updateDeck(
  classId: string,
  deckId: string,
  input: FlashcardDeckInput,
  db: Firestore = firestore,
): Promise<void> {
  const ref = flashcardDeckRef(db, classId, deckId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Deck not found.')
  const existing = parseFlashcardDeck(snap.data())

  const cards = prepareCards(input.cards)
  const { title, description } = cleanDeckText(input.title, input.description)

  const next = parseFlashcardDeck({
    ...existing,
    title,
    description,
    status: existing.kind === 'personal' ? 'private' : input.published ? 'published' : 'draft',
    cardCount: cards.length,
    cards,
    updatedAt: Timestamp.now(),
  })
  await setDoc(ref, next)
}

export async function deleteDeck(
  classId: string,
  deckId: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(flashcardDeckRef(db, classId, deckId))
}
