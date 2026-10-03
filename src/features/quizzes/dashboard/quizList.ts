import type { QuizRecord } from '../services/quizService'
import type { QuizStatus } from '../types'

export type QuizFilter = 'all' | QuizStatus
export type QuizSort = 'recent' | 'title'

export function filterAndSortQuizzes(quizzes: QuizRecord[], search: string, status: QuizFilter, sort: QuizSort): QuizRecord[] {
  const normalized = search.trim().toLocaleLowerCase('en-US')
  return quizzes
    .filter((quiz) => status === 'all' || quiz.status === status)
    .filter((quiz) => !normalized || quiz.title.toLocaleLowerCase('en-US').includes(normalized))
    .sort((first, second) => sort === 'title'
      ? first.title.localeCompare(second.title)
      : second.updatedAt.toMillis() - first.updatedAt.toMillis())
}
