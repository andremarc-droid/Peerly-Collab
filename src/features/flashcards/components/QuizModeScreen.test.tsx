import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlashcardDeckWithId } from '../types'
import { QuizModeScreen } from './QuizModeScreen'

const mocks = vi.hoisted(() => ({ buildQuiz: vi.fn(), gradeWrittenWithAi: vi.fn(), loadProgress: vi.fn(), saveProgress: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('../../studyEngine/quiz', async importOriginal => ({ ...await importOriginal<typeof import('../../studyEngine/quiz')>(), buildQuiz: mocks.buildQuiz }))
vi.mock('../../studyEngine/grading', async importOriginal => ({ ...await importOriginal<typeof import('../../studyEngine/grading')>(), gradeWrittenWithAi: mocks.gradeWrittenWithAi }))
vi.mock('../../studyEngine/services', () => ({ loadProgress: mocks.loadProgress, saveProgress: mocks.saveProgress }))

const deck = {
  id: 'deck', classId: 'personal', ownerId: 'learner', kind: 'personal', title: 'Biology', description: '',
  status: 'private', cardCount: 1, cards: [{ id: 'c1', front: 'Cell?', back: 'Unit' }],
  createdAt: { toMillis: () => 1 }, updatedAt: { toMillis: () => 1 },
} as FlashcardDeckWithId

beforeEach(() => {
  vi.clearAllMocks()
  mocks.buildQuiz.mockResolvedValue({ questions: [{ id: 'q', cardId: 'c1', kind: 'written', prompt: 'Cell?', answer: 'Unit', explanation: 'A cell is a unit.' }], notice: null })
  mocks.gradeWrittenWithAi.mockResolvedValue({ verdict: 'unsure', feedback: 'Self-grade.', selfGrade: true, reason: 'rate-limit' })
  mocks.loadProgress.mockResolvedValue({ version: 1, cards: {}, newDay: '2026-10-10', newCount: 0 })
  mocks.saveProgress.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('QuizModeScreen self-grade flow', () => {
  it('shows the AI reason and resolves self-grade once before completing', async () => {
    render(<QuizModeScreen deck={deck}/>)
    fireEvent.change(await screen.findByLabelText('Your answer'), { target: { value: 'a close answer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByText(/rate-limit/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'My answer was correct' }))
    expect(await screen.findByText(/Quiz complete/)).toBeTruthy()
    expect(screen.getByText(/1 correct of 1/)).toBeTruthy()
  })
})
