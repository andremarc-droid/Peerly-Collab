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

export const deckMembersRef = (db: Firestore, classId: string, deckId: string): CollectionReference =>
  collection(db, 'classes', classId, 'flashcardDecks', deckId, 'members')

export const deckMemberRef = (db: Firestore, classId: string, deckId: string, uid: string): DocumentReference =>
  doc(db, 'classes', classId, 'flashcardDecks', deckId, 'members', uid)

export const deckInvitesRef = (db: Firestore, classId: string, deckId: string): CollectionReference =>
  collection(db, 'classes', classId, 'flashcardDecks', deckId, 'invites')

export const deckInviteRef = (db: Firestore, classId: string, deckId: string, token: string): DocumentReference =>
  doc(db, 'classes', classId, 'flashcardDecks', deckId, 'invites', token)

export const deckActivityRef = (db: Firestore, classId: string, deckId: string): CollectionReference =>
  collection(db, 'classes', classId, 'flashcardDecks', deckId, 'activity')

export const deckPresenceRef = (db: Firestore, classId: string, deckId: string): CollectionReference =>
  collection(db, 'classes', classId, 'flashcardDecks', deckId, 'presence')

export const deckPresenceRecordRef = (db: Firestore, classId: string, deckId: string, uid: string): DocumentReference =>
  doc(db, 'classes', classId, 'flashcardDecks', deckId, 'presence', uid)
