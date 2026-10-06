import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { filterAndSortQuizzes } from './quizList'
import type { QuizRecord } from '../services/quizService'
import { defaultQuizSettings } from '../schemas/settings'

const makeQuiz = (
  id: string,
  title: string,
  status: QuizRecord['status'],
  updatedAt: number,
  mode: QuizRecord['mode'] = 'quiz',
): QuizRecord => ({
  id,
  ownerId: 'teacher',
  ownerName: 'Teacher',
  classId: null,
  title,
  description: '',
  tags: [],
  mode,
  status,
  questionCount: 1,
  createdAt: Timestamp.fromMillis(1),
  updatedAt: Timestamp.fromMillis(updatedAt),
  publishedAt: null,
  settings: defaultQuizSettings(mode),
})

describe('filterAndSortQuizzes', () => {
  const quizzes = [
    makeQuiz('1', 'Zoology', 'draft', 2, 'quiz'),
    makeQuiz('2', 'Algebra', 'published', 3, 'flashcards'),
    makeQuiz('3', 'Biology', 'archived', 1, 'canvas'),
  ]

  it('searches titles without case sensitivity and filters by status', () => {
    expect(filterAndSortQuizzes(quizzes, 'BIO', 'archived', 'recent').map(({ id }) => id)).toEqual(['3'])
    expect(filterAndSortQuizzes(quizzes, '', 'draft', 'recent').map(({ id }) => id)).toEqual(['1'])
  })

  it('sorts alphabetically or by recent update', () => {
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'title').map(({ title }) => title)).toEqual(['Algebra', 'Biology', 'Zoology'])
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent').map(({ id }) => id)).toEqual(['2', '1', '3'])
  })

  it('filters class assignments and keeps legacy unassigned quizzes discoverable', () => {
    const assigned = { ...quizzes[0], classId: 'class-a' }
    expect(filterAndSortQuizzes([assigned, ...quizzes], '', 'all', 'recent', 'class-a')).toEqual([assigned])
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent', 'unassigned')).toHaveLength(3)
  })

  it('filters by quiz mode (quiz, flashcards, canvas)', () => {
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent', 'all', 'all')).toHaveLength(3)
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent', 'all', 'quiz').map(({ id }) => id)).toEqual(['1'])
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent', 'all', 'flashcards').map(({ id }) => id)).toEqual(['2'])
    expect(filterAndSortQuizzes(quizzes, '', 'all', 'recent', 'all', 'canvas').map(({ id }) => id)).toEqual(['3'])
  })
})
