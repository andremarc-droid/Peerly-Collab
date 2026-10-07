import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import type { FlashcardDeckRecord } from './types'

export const flashcardDecksRef = (
  db: Firestore,
  classId: string,
): CollectionReference<FlashcardDeckRecord> =>
  collection(db, 'classes', classId, 'flashcardDecks') as CollectionReference<FlashcardDeckRecord>

export const flashcardDeckRef = (
  db: Firestore,
  classId: string,
  deckId: string,
): DocumentReference<FlashcardDeckRecord> =>
  doc(db, 'classes', classId, 'flashcardDecks', deckId) as DocumentReference<FlashcardDeckRecord>
