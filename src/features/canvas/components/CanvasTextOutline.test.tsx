import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasTextOutline } from './CanvasTextOutline'
import type { CanvasCard } from '../types'

afterEach(() => {
  cleanup()
})

const sampleCards: CanvasCard[] = [
  { id: 'c1', type: 'note', title: 'Light Reactions', content: 'Takes place in thylakoids', position: { x: 0, y: 0 } },
  { id: 'c2', type: 'paragraph', title: 'Calvin Cycle', content: 'Dark reactions that fix carbon', position: { x: 100, y: 0 } },
  { id: 'c3', type: 'link', title: 'Chloroplast Guide', content: 'Study resource', url: 'https://example.com/guide', position: { x: 200, y: 0 } },
]

describe('CanvasTextOutline', () => {
  it('renders cards and connections list', () => {
    render(
      <CanvasTextOutline
        cards={sampleCards}
        connections={['c1->c2']}
        directed={true}
      />,
    )

    expect(screen.getAllByText('Light Reactions').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Calvin Cycle').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Chloroplast Guide')).toBeInTheDocument()
    expect(screen.getByRole('list')).toHaveTextContent(/Light Reactions.*to.*Calvin Cycle/i)
  })

  it('filters cards by search input', () => {
    render(
      <CanvasTextOutline
        cards={sampleCards}
        connections={['c1->c2']}
        directed={true}
      />,
    )

    const searchInput = screen.getByPlaceholderText(/Search cards and connections/i)
    fireEvent.change(searchInput, { target: { value: 'thylakoid' } })

    expect(screen.getByText('Light Reactions')).toBeInTheDocument()
    expect(screen.queryByText('Calvin Cycle')).not.toBeInTheDocument()
  })

  it('notifies onSelectCard when card row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <CanvasTextOutline
        cards={sampleCards}
        connections={[]}
        onSelectCard={onSelect}
      />,
    )

    fireEvent.click(screen.getByText('Light Reactions'))
    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('renders undirected connections with "with" instead of "to"', () => {
    render(
      <CanvasTextOutline
        cards={sampleCards}
        connections={['c1<->c2']}
        directed={false}
      />,
    )

    expect(screen.getByRole('list')).toHaveTextContent(/Light Reactions.*with.*Calvin Cycle/i)
  })

  it('copies plain text outline to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(
      <CanvasTextOutline
        cards={sampleCards}
        connections={['c1->c2']}
        directed={true}
      />,
    )

    const copyBtn = screen.getByRole('button', { name: /Copy board outline to clipboard/i })
    fireEvent.click(copyBtn)

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining('=== BOARD OUTLINE ==='),
    )
  })
})
