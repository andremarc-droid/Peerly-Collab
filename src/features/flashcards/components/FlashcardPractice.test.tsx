import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlashcardDeckWithId } from '../types'
import { FlashcardPractice } from './FlashcardPractice'

const mocks = vi.hoisted(() => ({ loadProgress: vi.fn(), saveProgress: vi.fn(), recordActivity: vi.fn() }))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'learner' } }) }))
vi.mock('../../studyEngine/services', () => mocks)
vi.mock('../../stats/services', () => ({ recordActivity: mocks.recordActivity }))

const deck = {
  id: 'deck', classId: 'personal', ownerId: 'learner', kind: 'personal', title: 'Biology', description: '',
  status: 'private', cardCount: 2, cards: [{ id: 'c1', front: 'Cell?', back: 'Unit' }, { id: 'c2', front: 'Gene?', back: 'DNA' }],
  createdAt: { toMillis: () => 1 }, updatedAt: { toMillis: () => 1 },
} as FlashcardDeckWithId

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadProgress.mockResolvedValue({ version: 1, cards: {}, newDay: '2026-10-10', newCount: 0 })
  mocks.saveProgress.mockResolvedValue(undefined)
  mocks.recordActivity.mockResolvedValue(true)
})
afterEach(cleanup)

describe('FlashcardPractice', () => {
  it('loads progress and reveals answers before grading controls appear', async () => {
    render(<FlashcardPractice deck={deck}/>)
    expect(await screen.findByText(/Card 1 of 2/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Again/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    expect(screen.getByRole('button', { name: /Again/ })).toBeTruthy()
    expect(screen.getByText(/10m/)).toBeTruthy()
  })

  it('saves a grade and advances without skipping the next queued card', async () => {
    render(<FlashcardPractice deck={deck}/>)
    await screen.findByText(/Card 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/Card 2 of 2/)).toBeTruthy()
    expect(screen.getByText('Gene?')).toBeTruthy()
  })

  it('maps a right swipe to Good after reveal', async () => {
    render(<FlashcardPractice deck={deck}/>)
    await screen.findByText(/Card 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    const card = screen.getByText('Answer').closest('button')?.closest('.perspective-distant')?.parentElement
    expect(card).toBeTruthy()
    fireEvent.pointerDown(card!, { clientX: 10 })
    fireEvent.pointerUp(card!, { clientX: 100 })
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Gene?')).toBeTruthy()
  })

  it('keeps studying when the XP write is queued after a review', async () => {
    mocks.recordActivity.mockResolvedValue(false)
    render(<FlashcardPractice deck={deck}/> )
    await screen.findByText(/Card 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    fireEvent.click(screen.getByRole('button', { name: /Good/ }))
    expect(await screen.findByText(/Card 2 of 2/)).toBeTruthy()
    await waitFor(() => expect(mocks.recordActivity).toHaveBeenCalledWith('learner', expect.objectContaining({ kind: 'review', amount: 2 })))
  })
})
