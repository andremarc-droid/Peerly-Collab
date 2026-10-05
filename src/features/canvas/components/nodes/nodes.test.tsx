import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import { NoteCard } from './NoteCard'
import { ParagraphCard } from './ParagraphCard'
import { ImageCard } from './ImageCard'
import { LinkCard } from './LinkCard'
import type { CanvasCard } from '../../types'

function renderWithProvider(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>)
}

describe('custom canvas card components', () => {
  it('renders NoteCard with sticky-style title and content and handles on all four sides', () => {
    const card: CanvasCard = {
      id: 'n1',
      type: 'note',
      title: 'Study Note',
      content: 'Remember to connect related items.',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <NoteCard
        id="n1"
        data={{ card } as any}
        selected={false}
        type="note"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />,
    )

    expect(screen.getByText('Study Note')).toBeInTheDocument()
    expect(screen.getByText('Remember to connect related items.')).toBeInTheDocument()
    expect(screen.getByLabelText('Connect from top')).toBeInTheDocument()
    expect(screen.getByLabelText('Connect from right')).toBeInTheDocument()
    expect(screen.getByLabelText('Connect from bottom')).toBeInTheDocument()
    expect(screen.getByLabelText('Connect from left')).toBeInTheDocument()
  })

  it('renders ParagraphCard with title and clamped scrollable text', () => {
    const card: CanvasCard = {
      id: 'p1',
      type: 'paragraph',
      title: 'Historical Background',
      content: 'In 1896, Jose Rizal was executed in Bagumbayan. This sparked the revolution across the country.',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <ParagraphCard
        id="p1"
        data={{ card } as any}
        selected={false}
        type="paragraph"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />,
    )

    expect(screen.getByText('Historical Background')).toBeInTheDocument()
    expect(screen.getByText(/In 1896, Jose Rizal/)).toBeInTheDocument()
  })

  it('renders ImageCard with safe Drive embed iframe and fallback link', () => {
    const card: CanvasCard = {
      id: 'img1',
      type: 'image',
      title: 'Rizal Monument',
      content: 'Photograph of the monument',
      driveFileId: '1Abc1234567890xyz',
      driveKind: 'file',
      url: 'https://drive.google.com/file/d/1Abc1234567890xyz/view',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <ImageCard
        id="img1"
        data={{ card } as any}
        selected={false}
        type="image"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />,
    )

    const iframe = screen.getByTitle('Rizal Monument')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute('src', 'https://drive.google.com/file/d/1Abc1234567890xyz/preview')

    const fallbackLink = screen.getByRole('link', { name: /Open Rizal Monument in Google Drive/i })
    expect(fallbackLink).toBeInTheDocument()
    expect(fallbackLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(fallbackLink).toHaveAttribute('target', '_blank')
  })

  it('renders LinkCard with title, host, and opens in new tab with rel="noopener noreferrer"', () => {
    const card: CanvasCard = {
      id: 'l1',
      type: 'link',
      title: 'National Historical Commission',
      content: 'Official documentation and archives.',
      url: 'https://nhcp.gov.ph/resources/rizal',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <LinkCard
        id="l1"
        data={{ card } as any}
        selected={false}
        type="link"
        zIndex={1}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        selectable={true}
        deletable={true}
        draggable={true}
      />,
    )

    expect(screen.getByText('National Historical Commission')).toBeInTheDocument()
    expect(screen.getByText('Official documentation and archives.')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Visit National Historical Commission/i })
    expect(link).toHaveAttribute('href', 'https://nhcp.gov.ph/resources/rizal')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('nhcp.gov.ph')).toBeInTheDocument()
  })
})
