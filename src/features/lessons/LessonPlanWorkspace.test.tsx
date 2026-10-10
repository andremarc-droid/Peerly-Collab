import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeLesson, makePlan, makeProgress } from './testFactories'
import { LessonPlanWorkspace } from './LessonPlanWorkspace'

const mocks = vi.hoisted(() => ({ get: vi.fn(), progress: vi.fn(), saveLesson: vi.fn(), regenerate: vi.fn(), saveProgress: vi.fn() }))
vi.mock('../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('./services', () => ({ getLessonPlan: mocks.get, loadLessonProgress: mocks.progress, saveLesson: mocks.saveLesson, saveLessonProgress: mocks.saveProgress, renameLessonPlan: vi.fn(), reorderLessons: vi.fn(), deleteLesson: vi.fn(), deletePlan: vi.fn() }))
vi.mock('./generate', () => ({ regenerateLesson: mocks.regenerate }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({ plan: makePlan({ order: ['lesson-1'], lessonCount: 1 }), lessons: { 'lesson-1': makeLesson() } })
  mocks.progress.mockResolvedValue(makeProgress({ lessons: { 'lesson-1': { step: 'read', bestScore: 0, completedAt: null } }, lastLessonId: 'lesson-1' }))
  mocks.saveLesson.mockResolvedValue(undefined)
  mocks.saveProgress.mockResolvedValue(undefined)
  mocks.regenerate.mockRejectedValue(new Error('AI unavailable'))
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
    expect(screen.getByLabelText('Lesson content (Markdown)')).toHaveProperty('value', 'Edited content.')
  })
})
