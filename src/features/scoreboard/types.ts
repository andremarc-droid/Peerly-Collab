import type { Timestamp } from 'firebase/firestore'

export type ScoreboardPeriod = 'weekly' | 'allTime'

export interface ScoreboardEntry {
  uid: string
  displayName: string
  avatar: string | null
  points: number
  rank?: number
  updatedAt?: Timestamp
}

export interface ScoreboardRankingResult {
  entries: ScoreboardEntry[]
  userEntry?: ScoreboardEntry
}

export type StudyEventType = 'card_mastered' | 'practice_completed' | 'quiz_completed'
