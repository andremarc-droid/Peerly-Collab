import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { defaultQuizSettings } from '../quizzes/schemas/settings'
import type { QuizRecord } from '../quizzes/services/quizService'
import { canvasBoardStatus, countActivitiesByMode, filterActivities } from './classActivities'

const make = (id: string, mode: QuizRecord['mode'], questionCount = 1): QuizRecord => ({
  id, ownerId: 't', ownerName: 'T', classId: 'c', title: id, description: '', tags: [], mode, status: 'draft',
  questionCount, createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1), publishedAt: null, settings: defaultQuizSettings(mode),
})

describe('class activity helpers', () => {
  const items = [make('q', 'quiz'), make('f', 'flashcards'), make('c1', 'canvas'), make('c2', 'canvas', 0)]

  it('groups quiz and flashcards into Quizzes and canvas into Canvas', () => {
    expect(filterActivities(items, 'quizzes').map(({ id }) => id)).toEqual(['q', 'f'])
    expect(filterActivities(items, 'canvas').map(({ id }) => id)).toEqual(['c1', 'c2'])
  })

  it('derives honest per-mode counts', () => {
    expect(countActivitiesByMode(items)).toEqual({ quizzes: 2, canvas: 2, total: 4 })
    expect(countActivitiesByMode([])).toEqual({ quizzes: 0, canvas: 0, total: 0 })
  })

  it('reports board readiness from the board question', () => {
    expect(canvasBoardStatus(items[2])).toBe('Board ready')
    expect(canvasBoardStatus(items[3])).toBe('Add cards and connections')
  })
})
