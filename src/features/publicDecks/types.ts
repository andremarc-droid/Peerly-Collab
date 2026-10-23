import type { Timestamp } from 'firebase/firestore'
import type { Flashcard } from '../flashcards/types'

export type PublicDeckSortBy = 'newest' | 'mostSaved'

export interface PublicDeck {
  id: string
  ownerId: string
  authorDisplayName: string
  title: string
  description: string
  tags: string[]
  cardCount: number
  cards: Flashcard[]
  savesCount: number
  publishedAt: Timestamp
  updatedAt: Timestamp
}

export type ReportReason = 'inappropriate' | 'spam' | 'copyright' | 'other'

export interface PublicDeckReportInput {
  deckId: string
  reason: ReportReason
  note?: string
}

export interface PublicDeckFilter {
  search?: string
  tag?: string
  sortBy?: PublicDeckSortBy
}
