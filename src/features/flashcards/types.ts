import type { Timestamp } from 'firebase/firestore'

export type FlashcardDeckKind = 'class' | 'personal'
export type FlashcardDeckStatus = 'draft' | 'published' | 'private'

export interface Flashcard {
  id: string
  front: string
  back: string
}

export interface FlashcardDeckRecord {
  ownerId: string
  classId: string
  kind: FlashcardDeckKind
  title: string
  description: string
  status: FlashcardDeckStatus
  cardCount: number
  cards: Flashcard[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface FlashcardDeckWithId extends FlashcardDeckRecord {
  id: string
}

/** What the editor submits. `published` only matters for instructor (class) decks. */
export interface FlashcardDeckInput {
  title: string
  description: string
  cards: Flashcard[]
  published: boolean
}
