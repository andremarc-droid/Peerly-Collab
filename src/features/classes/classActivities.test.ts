import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { QuizRecord } from '../quizzes/services/quizService'
import { countActivitiesByMode, filterActivities } from './classActivities'

const make = (id: string, mode: QuizRecord['mode'], questionCount = 1): QuizRecord => ({
  id, ownerId: 't', ownerName: 'T', classId: 'c', title: id, description: '', tags: [], mode, status: 'draft',
  questionCount, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: null, settings: defaultQuizSettings(mode),
})

describe('class activity helpers', () => {
  const items = [make('q', 'quiz'), make('f', 'flashcards')]

  it('filters quizzes and flashcards into Quizzes', () => {
    expect(filterActivities(items, 'quizzes').map(({ id }) => id)).toEqual(['q', 'f'])
  })

  it('derives honest per-mode counts', () => {
    expect(countActivitiesByMode(items)).toEqual({ quizzes: 2, total: 2 })
    expect(countActivitiesByMode([])).toEqual({ quizzes: 0, total: 0 })
  })
})
