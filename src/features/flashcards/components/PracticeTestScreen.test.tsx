import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlashcardDeckWithId } from '../types'
import { PracticeTestScreen } from './PracticeTestScreen'

const serviceMocks = vi.hoisted(() => ({ listAttempts: vi.fn(), saveAttempt: vi.fn(), buildQuiz: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('../../studyEngine/quizAi', () => ({ generateDistractors: vi.fn().mockResolvedValue({}) }))
vi.mock('../../studyEngine/services', () => serviceMocks)
vi.mock('../../studyEngine/quiz', () => ({ buildQuiz: serviceMocks.buildQuiz }))

const deck = {
  id: 'deck', classId: 'personal', ownerId: 'learner', kind: 'personal', title: 'Biology', description: '',
  status: 'private', cardCount: 2, cards: [{ id: 'c1', front: 'Cell?', back: 'Unit' }, { id: 'c2', front: 'Gene?', back: 'DNA' }],
  createdAt: { toMillis: () => 1 }, updatedAt: { toMillis: () => 1 },
} as FlashcardDeckWithId

beforeEach(() => {
  vi.clearAllMocks()
  serviceMocks.listAttempts.mockResolvedValue([])
  serviceMocks.saveAttempt.mockResolvedValue('attempt-id')
  serviceMocks.buildQuiz.mockResolvedValue({ questions: [
    { id: 'q1', cardId: 'c1', kind: 'multiple-choice', prompt: 'Cell?', answer: 'Unit', options: ['Unit', 'wrong'], correctIndex: 0, explanation: 'A cell is a unit.' },
    { id: 'q2', cardId: 'c2', kind: 'multiple-choice', prompt: 'Gene?', answer: 'DNA', options: ['DNA', 'wrong'], correctIndex: 0, explanation: 'A gene is DNA.' },
  ], notice: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PracticeTestScreen setup', () => {
  it('offers count, question types, and timed or untimed choices', async () => {
    render(<PracticeTestScreen deck={deck}/>)
    expect(screen.getByRole('heading', { name: 'Set up a practice test' })).toBeTruthy()
    expect(screen.getByLabelText('Question count')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Multiple choice' })).toBeTruthy()
    expect(screen.getByLabelText('Time limit')).toBeTruthy()
    expect(screen.getByRole('option', { name: '30 minutes' })).toBeTruthy()
  })

  it('requires one question kind before starting', async () => {
    render(<PracticeTestScreen deck={deck}/>)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Multiple choice' })[0]!)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Written answer' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Start practice test' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })
})

describe('PracticeTestScreen session', () => {
  it('withholds feedback until submit, then shows score and review and saves history', async () => {
    render(<PracticeTestScreen deck={deck}/>)
    fireEvent.click(screen.getByRole('button', { name: 'Start practice test' }))
    const option = await screen.findByRole('button', { name: 'Unit' })
    fireEvent.click(option)
    expect(screen.queryByText('Reference: Unit')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'DNA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit test' }))
    expect(await screen.findByText(/Score:/)).toBeTruthy()
    expect(await screen.findByText('Reference: Unit')).toBeTruthy()
    await waitFor(() => expect(serviceMocks.saveAttempt).toHaveBeenCalledTimes(1))
  })

  it('shows latest attempt history with date, score, and duration', async () => {
    serviceMocks.listAttempts.mockResolvedValue([{ deckKey: 'personal~deck', createdAt: 1_800_000_000_000, startedAt: 1_799_999_940_000, durationSeconds: 60, timeLimitSeconds: 300, score: 3, maxScore: 4, review: [] }])
    render(<PracticeTestScreen deck={deck}/>)
    expect(await screen.findByText(/3\/4 · 60s/)).toBeTruthy()
  })

  it('automatically submits a timed test at expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
    render(<PracticeTestScreen deck={deck}/>)
    fireEvent.change(screen.getByLabelText('Time limit'), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start practice test' }))
    await vi.waitFor(() => expect(screen.getByText(/Question 1 of 2/)).toBeTruthy())
    await vi.advanceTimersByTimeAsync(300_000)
    await vi.waitFor(() => expect(serviceMocks.saveAttempt).toHaveBeenCalledTimes(1))
    vi.useRealTimers()
  })
})
