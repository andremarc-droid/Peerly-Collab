import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemPreviewDialog } from './ItemPreviewDialog'
import type { SharedGroupItem } from '../types'

describe('ItemPreviewDialog', () => {
  afterEach(cleanup)

  const mockDeckItem: SharedGroupItem = {
    id: 'item-deck-1',
    kind: 'deck',
    title: 'Mitosis Flashcards',
    summary: 'Phases of mitosis',
    sharedByUid: 'alice',
    sharedByName: 'Alice',
    sharedAt: { toMillis: () => 1000 } as any,
    version: 1,
    payload: {
      cardCount: 2,
      cards: [
        { id: 'c1', front: 'Prophase', back: 'Chromosomes condense' },
        { id: 'c2', front: 'Metaphase', back: 'Align at equator' },
      ],
    },
  }

  it('renders deck snapshot details, cards, and save copy button', () => {
    const handleSaveCopy = vi.fn().mockResolvedValue(undefined)
    const handleStudy = vi.fn()
    const handleClose = vi.fn()

    render(
      <ItemPreviewDialog
        item={mockDeckItem}
        open={true}
        onClose={handleClose}
        onSaveCopy={handleSaveCopy}
        onStudyDeck={handleStudy}
      />,
    )

    expect(screen.getByText('Mitosis Flashcards')).toBeTruthy()
    expect(screen.getByText('Shared by Alice')).toBeTruthy()
    expect(screen.getByText('Prophase')).toBeTruthy()
    expect(screen.getByText('Chromosomes condense')).toBeTruthy()

    const saveBtn = screen.getByRole('button', { name: /save a copy to my library/i })
    fireEvent.click(saveBtn)
    expect(handleSaveCopy).toHaveBeenCalledWith(mockDeckItem)

    const studyBtn = screen.getByRole('button', { name: /study/i })
    fireEvent.click(studyBtn)
    expect(handleStudy).toHaveBeenCalledWith(mockDeckItem)
  })

  it('renders note snapshot text', () => {
    const mockNoteItem: SharedGroupItem = {
      id: 'item-note-1',
      kind: 'note',
      title: 'Lab Safety Guidelines',
      sharedByUid: 'bob',
      sharedByName: 'Bob',
      sharedAt: { toMillis: () => 1000 } as any,
      version: 1,
      payload: {
        text: 'Wear goggles at all times in the laboratory.',
      },
    }

    render(
      <ItemPreviewDialog
        item={mockNoteItem}
        open={true}
        onClose={() => {}}
        onSaveCopy={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(screen.getByText('Lab Safety Guidelines')).toBeTruthy()
    expect(screen.getByText('Wear goggles at all times in the laboratory.')).toBeTruthy()
  })
})
