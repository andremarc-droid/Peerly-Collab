import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { filterAndSortQuizzes } from './quizList'
import type { QuizRecord } from '../services/quizService'
import { defaultQuizSettings } from '../schemas/settings'

const makeQuiz = (id: string, title: string, status: QuizRecord['status'], updatedAt: number): QuizRecord => ({
  id, ownerId: 'teacher', ownerName: 'Teacher', title, description: '', tags: [], mode: 'quiz', status,
  questionCount: 1, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(updatedAt), publishedAt: null,
  settings: defaultQuizSettings('quiz'),
})

describe('filterAndSortQuizzes', () => {
  const quizzes = [makeQuiz('1', 'Zoology', 'draft', 2), makeQuiz('2', 'Algebra', 'published', 3), makeQuiz('3', 'Biology', 'archived', 1)]
  it('searches titles without case sensitivity and filters by status', () => {
    expect(filterAndSortQuizzes(quizzes, 'BIO', 'archived', 'recent').map(({ id }) => id)).toEqual(['3'])
    expect(filterAndSortQuizzes(quizzes, '', 'draft', 'recent').map(({ id }) => id)).toEqual(['1'])
  })
  it('sorts alphabetically or by recent update', () => {
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'title').map(({ title }) => title)).toEqual(['Algebra', 'Biology', 'Zoology'])
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent').map(({ id }) => id)).toEqual(['2', '1', '3'])
  })
})
