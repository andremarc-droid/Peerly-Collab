import type { QuizRecord } from '../quizzes/services/quizService'

/** Live feed of a class's activities, owned by ClassPage and shared by the Quizzes and Canvas tabs. */
export interface ActivityFeed {
  items: QuizRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
}

export type ActivityGroup = 'quizzes' | 'canvas'

/** Quizzes tab shows quiz and flashcards modes; Canvas tab shows canvas mode only. */
export function filterActivities(items: QuizRecord[], group: ActivityGroup): QuizRecord[] {
  return items.filter((item) => (group === 'canvas' ? item.mode === 'canvas' : item.mode !== 'canvas'))
}

export function countActivitiesByMode(items: QuizRecord[]) {
  const canvas = filterActivities(items, 'canvas').length
  return { quizzes: items.length - canvas, canvas, total: items.length }
}

/** The quiz document has no card/connection counts, so readiness is based on whether the board question exists. */
export function canvasBoardStatus(quiz: Pick<QuizRecord, 'questionCount'> & { boardKind?: 'prebuilt' | 'blank' }): string {
  if (quiz.boardKind === 'blank') {
    return quiz.questionCount > 0 ? 'Instructions ready' : 'Add instructions'
  }
  return quiz.questionCount > 0 ? 'Board ready' : 'Add cards and connections'
}
