import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLesson, makePlan, makeProgress } from './testFactories'
import { LessonPlanWorkspace } from './LessonPlanWorkspace'

const mocks = vi.hoisted(() => ({ get: vi.fn(), progress: vi.fn(), saveLesson: vi.fn(), regenerate: vi.fn(), saveProgress: vi.fn(), recordActivity: vi.fn(), loadSource: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('./services', () => ({ getLessonPlan: mocks.get, loadLessonProgress: mocks.progress, saveLesson: mocks.saveLesson, saveLessonProgress: mocks.saveProgress, loadPlanSource: mocks.loadSource, renameLessonPlan: vi.fn(), reorderLessons: vi.fn(), deleteLesson: vi.fn(), deletePlan: vi.fn() }))
vi.mock('./generate', () => ({ regenerateLesson: mocks.regenerate }))
vi.mock('../stats/services', () => ({ recordActivity: mocks.recordActivity }))
vi.mock('./LessonPlayer', () => ({ LessonPlayer: ({ onQuizComplete }: { onQuizComplete: (score: number, total: number) => void }) => <button onClick={() => onQuizComplete(2, 3)}>Complete lesson</button> }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({ plan: makePlan({ order: ['lesson-1'], lessonCount: 1 }), lessons: { 'lesson-1': makeLesson() } })
  mocks.progress.mockResolvedValue(makeProgress({ lessons: { 'lesson-1': { step: 'read', bestScore: 0, completedAt: null } }, lastLessonId: 'lesson-1' }))
  mocks.saveLesson.mockResolvedValue(undefined)
  mocks.loadSource.mockResolvedValue('My own pasted notes about cells.')
  mocks.saveProgress.mockResolvedValue(undefined)
  mocks.regenerate.mockRejectedValue(new Error('AI unavailable'))
  mocks.recordActivity.mockResolvedValue(true)
})
afterEach(cleanup)

describe('LessonPlanWorkspace', () => {
  it('edits and saves lesson content, and retains the old lesson if regeneration fails', async () => {
    render(<LessonPlanWorkspace plan={makePlan({ order: ['lesson-1'], lessonCount: 1 })} onClose={vi.fn()} onChanged={vi.fn()}/> )
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const content = await screen.findByLabelText('Lesson content (Markdown)')
    fireEvent.change(content, { target: { value: 'Edited content.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save lesson edits' }))
    expect(mocks.saveLesson).toHaveBeenCalled()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Regenerate lesson' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate lesson' }))
    expect(await screen.findByText(/Your saved lesson is unchanged/)).toBeTruthy()
    expect(mocks.regenerate).toHaveBeenCalledWith(expect.objectContaining({ sourceText: 'My own pasted notes about cells.' }))
    expect(screen.getByLabelText('Lesson content (Markdown)')).toHaveProperty('value', 'Edited content.')
  })

  it('records the first lesson completion as one 20 XP action', async () => {
    render(<LessonPlanWorkspace plan={makePlan({ order: ['lesson-1'], lessonCount: 1 })} onClose={vi.fn()} onChanged={vi.fn()}/> )
    fireEvent.click(await screen.findByRole('button', { name: 'Complete lesson' }))
    await waitFor(() => expect(mocks.recordActivity).toHaveBeenCalledWith('learner', { kind: 'lessonCompleted', amount: 20, key: 'lesson:plan-a:lesson-1' }))
  })
})
