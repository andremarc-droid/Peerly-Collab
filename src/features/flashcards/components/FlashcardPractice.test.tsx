import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('renders cards with Previous and Next buttons and flips on click', async () => {
    render(<FlashcardPractice deck={deck} />)
    expect(await screen.findByText(/Card 1 of 2/)).toBeTruthy()
    expect(screen.getByText('Cell?')).toBeTruthy()
    
    // Previous is disabled on first card
    const prevBtn = screen.getByRole('button', { name: /Previous/ })
    expect((prevBtn as HTMLButtonElement).disabled).toBe(true)

    // Flip to answer
    fireEvent.click(screen.getByRole('button', { name: /Reveal answer/ }))
    expect(screen.getByText('Unit')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Show question/ })).toBeTruthy()

    // Next button moves to next card
    const nextBtn = screen.getByRole('button', { name: /Next card/ })
    fireEvent.click(nextBtn)
    expect(await screen.findByText(/Card 2 of 2/)).toBeTruthy()
    expect(screen.getByText('Gene?')).toBeTruthy()

    // Previous is now enabled
    expect((screen.getByRole('button', { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('navigates previous and next', async () => {
    render(<FlashcardPractice deck={deck} />)
    await screen.findByText(/Card 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: /Next card/ }))
    expect(await screen.findByText(/Card 2 of 2/)).toBeTruthy()

    // Click previous
    fireEvent.click(screen.getByRole('button', { name: /Previous/ }))
    expect(await screen.findByText(/Card 1 of 2/)).toBeTruthy()
    expect(screen.getByText('Cell?')).toBeTruthy()
  })

  it('navigates via touch/pointer swipe gestures', async () => {
    render(<FlashcardPractice deck={deck} />)
    await screen.findByText(/Card 1 of 2/)
    const container = screen.getByText('Cell?').closest('.select-none')
    expect(container).toBeTruthy()

    // Swipe left (negative deltaX) -> next card
    fireEvent.pointerDown(container!, { clientX: 100, clientY: 50 })
    fireEvent.pointerUp(container!, { clientX: 20, clientY: 50 })
    expect(await screen.findByText(/Card 2 of 2/)).toBeTruthy()
    expect(screen.getByText('Gene?')).toBeTruthy()

    // Swipe right (positive deltaX) -> previous card
    fireEvent.pointerDown(container!, { clientX: 20, clientY: 50 })
    fireEvent.pointerUp(container!, { clientX: 100, clientY: 50 })
    expect(await screen.findByText(/Card 1 of 2/)).toBeTruthy()
    expect(screen.getByText('Cell?')).toBeTruthy()
  })

  it('finishes session and allows restarting', async () => {
    render(<FlashcardPractice deck={deck} />)
    await screen.findByText(/Card 1 of 2/)
    fireEvent.click(screen.getByRole('button', { name: /Next card/ }))
    await screen.findByText(/Card 2 of 2/)

    // On last card, button says Finish
    const finishBtn = screen.getByRole('button', { name: /Finish session/ })
    fireEvent.click(finishBtn)

    expect(await screen.findByText('Session complete')).toBeTruthy()
    expect(screen.getByText(/You reviewed all 2 cards in this deck/)).toBeTruthy()

    // Restart
    fireEvent.click(screen.getByRole('button', { name: /Study again/ }))
    expect(await screen.findByText(/Card 1 of 2/)).toBeTruthy()
  })
})
