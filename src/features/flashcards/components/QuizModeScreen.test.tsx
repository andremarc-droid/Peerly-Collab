import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlashcardDeckWithId } from '../types'
import { QuizModeScreen } from './QuizModeScreen'

const mocks = vi.hoisted(() => ({ buildQuiz: vi.fn(), gradeWrittenWithAi: vi.fn(), loadProgress: vi.fn(), saveProgress: vi.fn(), recordActivity: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('../../studyEngine/quiz', async importOriginal => ({ ...await importOriginal<typeof import('../../studyEngine/quiz')>(), buildQuiz: mocks.buildQuiz }))
vi.mock('../../studyEngine/grading', async importOriginal => ({ ...await importOriginal<typeof import('../../studyEngine/grading')>(), gradeWrittenWithAi: mocks.gradeWrittenWithAi }))
vi.mock('../../studyEngine/services', () => ({ loadProgress: mocks.loadProgress, saveProgress: mocks.saveProgress }))
vi.mock('../../stats/services', () => ({ recordActivity: mocks.recordActivity }))

const deck = {
  id: 'deck', classId: 'personal', ownerId: 'learner', kind: 'personal', title: 'Biology', description: '',
  status: 'private', cardCount: 1, cards: [{ id: 'c1', front: 'Cell?', back: 'Unit' }],
  createdAt: { toMillis: () => 1 }, updatedAt: { toMillis: () => 1 },
} as FlashcardDeckWithId

const written = (id: string, cardId: string, prompt: string, answer: string) => ({ id, cardId, kind: 'written', prompt, answer, explanation: `${prompt} ${answer}` })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildQuiz.mockResolvedValue({ questions: [{ id: 'q', cardId: 'c1', kind: 'written', prompt: 'Cell?', answer: 'Unit', explanation: 'A cell is a unit.' }], notice: null })
  mocks.gradeWrittenWithAi.mockResolvedValue({ verdict: 'unsure', feedback: 'Self-grade.', selfGrade: true, reason: 'rate-limit' })
  mocks.loadProgress.mockResolvedValue({ version: 1, cards: {}, newDay: '2026-10-10', newCount: 0 })
  mocks.saveProgress.mockResolvedValue(undefined)
  mocks.recordActivity.mockResolvedValue(true)
})
afterEach(cleanup)

describe('QuizModeScreen self-grade flow', () => {
  it('shows the AI reason and resolves self-grade once before completing', async () => {
    render(<QuizModeScreen deck={deck}/>)
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'a close answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText(/rate-limit/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'My answer was correct' }))
    fireEvent.click(await screen.findByRole('button', { name: 'See results' }))
    expect(await screen.findByText(/Quiz complete/)).toBeTruthy()
    expect(screen.getByText(/1 correct of 1/)).toBeTruthy()
    await vi.waitFor(() => expect(mocks.recordActivity).toHaveBeenCalledWith('learner', expect.objectContaining({ kind: 'quizFinished', amount: 6 })))
    expect(mocks.recordActivity).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['My answer was correct'],
    ['My answer was incorrect'],
  ])('keeps the written answer visible after choosing “%s” on the last question', async (choice) => {
    render(<QuizModeScreen deck={deck}/>)
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'the basic unit of life' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    fireEvent.click(await screen.findByRole('button', { name: choice }))
    expect(await screen.findByRole('button', { name: 'See results' })).toBeTruthy()
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('the basic unit of life')
    expect(screen.getByText('the basic unit of life', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByText(/Quiz complete/)).toBeNull()
  })

  it('keeps the written answer visible after self-grading a middle question, then moves on cleanly', async () => {
    mocks.buildQuiz.mockResolvedValue({ questions: [written('q1', 'c1', 'Cell?', 'Unit'), written('q2', 'c2', 'Atom?', 'Particle')], notice: null })
    render(<QuizModeScreen deck={deck}/>)
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'first answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'My answer was incorrect' }))
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('first answer')
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(await screen.findByText('Atom?')).toBeTruthy()
    expect((screen.getByLabelText('Your answer') as HTMLTextAreaElement).value).toBe('')
  })

  it('saves progress for the final card before showing results', async () => {
    render(<QuizModeScreen deck={deck}/>)
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'unit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'My answer was correct' }))
    expect(mocks.saveProgress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'See results' }))
    await vi.waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Quiz complete/)).toBeTruthy()
  })
})
