import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError } from '../studyEngine/ai'
import { makeLesson, makePlan } from './testFactories'
import { LearnTopicDialog } from './LearnTopicDialog'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), remaining: vi.fn(), createPlan: vi.fn(), saveLesson: vi.fn() }))
vi.mock('../documents', () => ({ DocumentPicker: () => null, useDocumentImport: () => ({ documents: [], errors: [], preparing: false, addFiles: vi.fn() }) }))
vi.mock('./generate', () => ({ generateLessonPlan: mocks.generate, generateRemainingLessons: mocks.remaining }))
vi.mock('./services', () => ({ createLessonPlan: mocks.createPlan, saveLesson: mocks.saveLesson }))

const outline = { title: 'Cell biology', lessons: Array.from({ length: 3 }, (_, index) => ({ id: `lesson-${index + 1}`, title: `Lesson ${index + 1}`, objective: 'Understand cells' })) }
const lessonRecord = (id: string) => { const { id: _id, updatedAt: _updated, ...record } = makeLesson({ id }); return record }
const ready = { outline, lessons: { 'lesson-1': lessonRecord('lesson-1'), 'lesson-2': lessonRecord('lesson-2'), 'lesson-3': lessonRecord('lesson-3') }, failedLessonIds: [], status: 'ready' as const, cancelled: false, sourceCapped: false }
const partial = { ...ready, lessons: { 'lesson-1': lessonRecord('lesson-1') }, failedLessonIds: ['lesson-2', 'lesson-3'], status: 'partial' as const }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createPlan.mockResolvedValue(makePlan())
  mocks.saveLesson.mockResolvedValue(undefined)
  mocks.generate.mockResolvedValue(ready)
  mocks.remaining.mockResolvedValue(ready)
})
afterEach(cleanup)
function renderDialog() { return render(<LearnTopicDialog uid="learner" onClose={vi.fn()} onSaved={vi.fn()} onOpen={vi.fn()}/>) }

describe('LearnTopicDialog', () => {
  it('creates and saves a complete topic plan', async () => {
    renderDialog()
    fireEvent.change(screen.getByText('Topic').parentElement!.querySelector('input')!, { target: { value: 'Cell biology' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson plan' }))
    expect(await screen.findByText(/3 of 3 lessons ready/)).toBeTruthy()
    expect(mocks.createPlan).toHaveBeenCalledWith('learner', expect.objectContaining({ status: 'ready', topic: 'Cell biology' }))
  })

  it('saves partial results and generates the missing lessons on request', async () => {
    mocks.generate.mockResolvedValueOnce(partial)
    renderDialog()
    fireEvent.change(screen.getByText('Topic').parentElement!.querySelector('input')!, { target: { value: 'Cell biology' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson plan' }))
    expect(await screen.findByText(/Partial plan saved/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Generate the rest (2)' }))
    expect(await screen.findByText(/3 of 3 lessons ready/)).toBeTruthy()
    expect(mocks.saveLesson).toHaveBeenCalledTimes(2)
  })

  it('keeps and saves completed work when generation is cancelled', async () => {
    mocks.generate.mockImplementation((_options: { signal: AbortSignal }) => new Promise(resolve => {
      _options.signal.addEventListener('abort', () => resolve({ ...partial, cancelled: true }), { once: true })
    }))
    renderDialog()
    fireEvent.change(screen.getByText('Topic').parentElement!.querySelector('input')!, { target: { value: 'Cells' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson plan' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel generation' }))
    expect(await screen.findByText(/Generation was stopped/)).toBeTruthy()
    expect(mocks.createPlan).toHaveBeenCalledWith('learner', expect.objectContaining({ status: 'partial' }))
  })

  it('shows the AI rate-limit state without losing the dialog', async () => {
    mocks.generate.mockRejectedValueOnce(new AiError('rate-limit', 'Try later'))
    renderDialog()
    fireEvent.change(screen.getByText('Topic').parentElement!.querySelector('input')!, { target: { value: 'Cells' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create lesson plan' }))
    expect(await screen.findByText('The AI is rate-limited. Try again later.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create lesson plan' })).toBeTruthy()
  })
})
