import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { makeLesson, makePlan, makeProgress } from './testFactories'
import { LessonsTab } from './LessonsTab'

const mocks = vi.hoisted(() => ({ list: vi.fn(), progress: vi.fn(), get: vi.fn(), loadProgress: vi.fn(), rename: vi.fn(), remove: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('./services', () => ({ listLessonPlans: mocks.list, loadLessonProgress: mocks.loadProgress, getLessonPlan: mocks.get, renameLessonPlan: mocks.rename, deletePlan: mocks.remove, reorderLessons: vi.fn(), saveLesson: vi.fn(), saveLessonProgress: vi.fn(), loadPlanSource: vi.fn().mockResolvedValue(''), deleteLesson: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  const plan = makePlan()
  mocks.list.mockResolvedValue([plan])
  mocks.progress.mockResolvedValue(makeProgress({ lessons: { 'lesson-1': { step: 'done', bestScore: 2, completedAt: 1 } }, lastLessonId: 'lesson-1' }))
  mocks.loadProgress.mockResolvedValue(makeProgress({ lessons: { 'lesson-1': { step: 'done', bestScore: 2, completedAt: 1 } }, lastLessonId: 'lesson-1' }))
  mocks.get.mockResolvedValue({ plan, lessons: { 'lesson-1': makeLesson(), 'lesson-2': makeLesson({ id: 'lesson-2' }) } })
  mocks.rename.mockResolvedValue(undefined)
  mocks.remove.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('LessonsTab', () => {
  it('lists plans with completion and resumes the last lesson step', async () => {
    render(<MemoryRouter><LessonsTab/></MemoryRouter>)
    expect(await screen.findByText('Cell biology')).toBeTruthy()
    expect(screen.getByText('33%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(await screen.findByRole('dialog', { name: 'Cell biology' })).toBeTruthy()
    expect(await screen.findAllByRole('button', { name: 'Cell structure' })).toHaveLength(2)
  })

  it('shows an honest empty state and opens the Learn a topic flow', async () => {
    mocks.list.mockResolvedValueOnce([])
    render(<MemoryRouter><LessonsTab/></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Learn a topic' }))
    expect(await screen.findByRole('heading', { name: 'Learn a topic' })).toBeTruthy()
  })
})
