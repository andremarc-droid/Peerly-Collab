import type { QuizRecord } from '../quizzes/services/quizService'

/** Live feed of a class's activities, owned by ClassPage and shown in the Quizzes tab. */
export interface ActivityFeed {
  items: QuizRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

export type ActivityGroup = 'quizzes'

export function filterActivities(items: QuizRecord[], _group: ActivityGroup = 'quizzes'): QuizRecord[] {
  return items.filter((item) => item.mode === 'quiz' || item.mode === 'flashcards')
}

export function countActivitiesByMode(items: QuizRecord[]) {
  const filtered = filterActivities(items)
  return { quizzes: filtered.length, total: filtered.length }
}
