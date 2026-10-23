import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceReviewDialog } from './ResourceReviewDialog'
import type { ModuleResourceWithId } from './types'

const now = Timestamp.fromMillis(1)

const driveResource: ModuleResourceWithId = {
  id: 'r-drive',
  type: 'drive',
  title: 'Biology Chapter 1 Doc',
  order: 0,
  url: 'https://docs.google.com/document/d/abcdefghijk/view',
  driveFileId: 'abcdefghijk',
  driveKind: 'doc',
  createdAt: now,
  updatedAt: now,
}

const youtubeResource: ModuleResourceWithId = {
  id: 'r-youtube',
  type: 'youtube',
  title: 'Cell Division Video',
  order: 1,
  url: 'https://www.youtube.com/watch?v=12345678901',
  youtubeVideoId: '12345678901',
  createdAt: now,
  updatedAt: now,
}

const linkResource: ModuleResourceWithId = {
  id: 'r-link',
  type: 'link',
  title: 'Khan Academy Cells',
  order: 2,
  url: 'https://www.khanacademy.org/science/biology',
  createdAt: now,
  updatedAt: now,
}

const noteResource: ModuleResourceWithId = {
  id: 'r-note',
  type: 'text',
  title: 'Exam Instructions',
  body: 'Please read chapter 1 before taking the quiz on Friday.',
  order: 3,
  createdAt: now,
  updatedAt: now,
}

describe('ResourceReviewDialog', () => {
  afterEach(cleanup)

  it('renders nothing when open is false', () => {
    const { container } = render(
      <ResourceReviewDialog open={false} resource={driveResource} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('reviews Google Drive resource with embed preview and open in Drive button', () => {
    render(<ResourceReviewDialog open resource={driveResource} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Biology Chapter 1 Doc' })).toBeInTheDocument()
    expect(screen.getByText('Google Doc')).toBeInTheDocument()
    expect(screen.getByTitle('Biology Chapter 1 Doc preview')).toHaveAttribute(
      'src',
      'https://docs.google.com/document/d/abcdefghijk/preview',
    )
    expect(screen.getByRole('link', { name: 'Open in Google Drive' })).toHaveAttribute(
      'href',
      'https://docs.google.com/document/d/abcdefghijk/view',
    )
  })

  it('reviews YouTube video resource with embed preview and fallback link', () => {
    render(<ResourceReviewDialog open resource={youtubeResource} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Cell Division Video' })).toBeInTheDocument()
    expect(screen.getByTitle('Cell Division Video preview')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/12345678901',
    )
    expect(screen.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=12345678901',
    )
  })

  it('reviews external link resource with host and open link button', () => {
    render(<ResourceReviewDialog open resource={linkResource} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Khan Academy Cells' })).toBeInTheDocument()
    expect(screen.getByText('www.khanacademy.org')).toBeInTheDocument()
    expect(screen.getByText('https://www.khanacademy.org/science/biology')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open link' })).toHaveAttribute(
      'href',
      'https://www.khanacademy.org/science/biology',
    )
  })

  it('reviews plain text note resource with note body', () => {
    render(<ResourceReviewDialog open resource={noteResource} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Exam Instructions' })).toBeInTheDocument()
    expect(
      screen.getByText('Please read chapter 1 before taking the quiz on Friday.'),
    ).toBeInTheDocument()
  })

  it('calls onEdit when Edit resource button is clicked', () => {
    const onEdit = vi.fn()
    const onClose = vi.fn()
    render(
      <ResourceReviewDialog open resource={driveResource} onClose={onClose} onEdit={onEdit} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit resource' }))
    expect(onClose).toHaveBeenCalled()
    expect(onEdit).toHaveBeenCalledWith(driveResource)
  })

  it('calls onClose when Done button is clicked', () => {
    const onClose = vi.fn()
    render(<ResourceReviewDialog open resource={noteResource} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})
