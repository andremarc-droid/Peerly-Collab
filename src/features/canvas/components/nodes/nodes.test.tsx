import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import { CanvasImagesProvider } from '../CanvasImagesContext'
import { NoteCard } from './NoteCard'
import { ParagraphCard } from './ParagraphCard'
import { ImageCard } from './ImageCard'
import { LinkCard } from './LinkCard'
import type { CanvasCard } from '../../types'

function renderWithProvider(ui: React.ReactElement, images: Record<string, { dataUrl: string; alt?: string }> = {}) {
  return render(
    <ReactFlowProvider>
      <CanvasImagesProvider images={images}>
        {ui}
      </CanvasImagesProvider>
    </ReactFlowProvider>,
  )
}

describe('custom canvas card components', () => {
  afterEach(cleanup)
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

  it('renders ImageCard with base64 image data and alt text', () => {
    const card: CanvasCard = {
      id: 'img1',
      type: 'image',
      title: 'Rizal Monument',
      content: 'Photograph of the monument',
      imageId: 'img_rizal',
      alt: 'Rizal monument in Luneta park',
      position: { x: 0, y: 0 },
    }

    const testImages = {
      img_rizal: {
        dataUrl: 'data:image/jpeg;base64,QUJDREVGR0g=',
        alt: 'Rizal monument in Luneta park',
      },
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
      testImages,
    )

    const img = screen.getByAltText('Rizal monument in Luneta park')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,QUJDREVGR0g=')
    expect(img.className).toContain('object-contain')
  })

  it('renders ImageCard with Re-upload required alert for legacy Drive cards', () => {
    const legacyCard: CanvasCard = {
      id: 'img_legacy',
      type: 'image',
      title: 'Legacy Monument',
      content: '',
      driveFileId: '1Abc1234567890xyz',
      driveKind: 'file',
      url: 'https://drive.google.com/file/d/1Abc1234567890xyz/view',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <ImageCard
        id="img_legacy"
        data={{ card: legacyCard } as any}
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

    const alertEl = screen.getByRole('alert')
    expect(alertEl).toBeInTheDocument()
    expect(alertEl).toHaveTextContent('Re-upload required')
  })

  it('renders ImageCard with Image unavailable fallback when image document is missing', () => {
    const missingCard: CanvasCard = {
      id: 'img_missing',
      type: 'image',
      title: 'Missing Image',
      content: '',
      imageId: 'img_not_found',
      alt: 'Detailed description of the missing picture',
      position: { x: 0, y: 0 },
    }

    renderWithProvider(
      <ImageCard
        id="img_missing"
        data={{ card: missingCard } as any}
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
      {},
    )

    const statusEl = screen.getByRole('status')
    expect(statusEl).toBeInTheDocument()
    expect(statusEl).toHaveTextContent('Image unavailable')
    expect(statusEl).toHaveTextContent('Detailed description of the missing picture')
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
