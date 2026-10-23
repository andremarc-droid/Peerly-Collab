import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicDecksTab } from './components/PublicDecksTab'
import * as services from './services'
import type { PublicDeck } from './types'

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'student-1' } }),
}))

vi.mock('../../shared/ui/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const mockDecks: PublicDeck[] = [
  {
    id: 'deck-1',
    ownerId: 'teacher-1',
    authorDisplayName: 'Teacher Bob',
    title: 'World Capitals',
    description: 'Learn capitals of the world',
    tags: ['geography', 'capitals'],
    cardCount: 20,
    cards: [
      { id: 'c1', front: 'France', back: 'Paris' },
      { id: 'c2', front: 'Japan', back: 'Tokyo' },
    ],
    savesCount: 5,
    publishedAt: {} as any,
    updatedAt: {} as any,
  },
]

describe('PublicDecksTab', () => {
  beforeEach(() => {
    vi.spyOn(services, 'listPublicDecks').mockResolvedValue(mockDecks)
    vi.spyOn(services, 'copyPublicDeckToLibrary').mockResolvedValue('new-copy-id')
  })

  afterEach(cleanup)

  it('renders public decks list with author and counts', async () => {
    render(<PublicDecksTab />)
    expect(await screen.findByText('World Capitals')).toBeTruthy()
    expect(screen.getByText('By Teacher Bob')).toBeTruthy()
    expect(screen.getByText('20 cards')).toBeTruthy()
    expect(screen.getByText('5 saves')).toBeTruthy()
  })

  it('opens preview dialog and allows adding to library', async () => {
    render(<PublicDecksTab />)
    const previewBtn = await screen.findByRole('button', { name: /Preview World Capitals/i })
    fireEvent.click(previewBtn)

    expect(await screen.findByText('Card 1 of 20')).toBeTruthy()
    expect(screen.getByText('France')).toBeTruthy()

    const addBtn = screen.getByRole('button', { name: 'Add to my library' })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(services.copyPublicDeckToLibrary).toHaveBeenCalledWith(
        mockDecks[0],
        'student-1',
      )
    })
  })

  it('shows empty state when search finds no matches', async () => {
    render(<PublicDecksTab />)
    await screen.findByText('World Capitals')

    const searchInput = screen.getByLabelText(/Search public decks/i)
    fireEvent.change(searchInput, { target: { value: 'Quantum Physics' } })

    expect(await screen.findByText('No public decks found')).toBeTruthy()
  })
})
