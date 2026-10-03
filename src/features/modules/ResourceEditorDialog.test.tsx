import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceEditorDialog } from './ResourceEditorDialog'

describe('resource authoring dialogs', () => {
  afterEach(cleanup)
  it('shows a specific Drive folder error and saves a valid live preview', async () => {
    const onSave = vi.fn(async () => undefined)
    const view = render(<ResourceEditorDialog open onClose={vi.fn()} onSave={onSave} />)
    fireEvent.change(document.querySelector<HTMLInputElement>('#resource-url')!, { target: { value: 'https://drive.google.com/drive/folders/abcdefghijk' } })
    expect(await screen.findByText('Folders are not supported, share a single file.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save resource' })).toBeDisabled()

    fireEvent.change(document.querySelector<HTMLInputElement>('#resource-url')!, { target: { value: 'https://example.com/file/d/abcdefghijk/view' } })
    expect(await screen.findByText('Use a Google Drive or Docs file link.')).toBeInTheDocument()

    fireEvent.change(document.querySelector<HTMLInputElement>('#resource-url')!, { target: { value: 'https://docs.google.com/document/d/abcdefghijk/edit?usp=sharing' } })
    expect(await screen.findByText('Detected:')).toBeInTheDocument()
    expect(screen.getByTitle(/Google Doc .* preview/)).toHaveAttribute('src', 'https://docs.google.com/document/d/abcdefghijk/preview')
    expect(screen.getByRole('link', { name: 'Open in Drive' })).toHaveAttribute('href', 'https://docs.google.com/document/d/abcdefghijk/view')
    expect(screen.getByText(/press Share/)).toBeInTheDocument()
    expect(screen.getByText(/School Google accounts can limit this/)).toBeInTheDocument()
    expect(screen.getByText(/blocks third-party cookies/)).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Google Doc abcdefgh')
    fireEvent.click(screen.getByRole('button', { name: 'Save resource' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'drive', driveKind: 'doc', driveFileId: 'abcdefghijk' })))
    view.unmount()
  })

  it('previews supported YouTube links and accepts only safe HTTPS links and plain text notes', async () => {
    const onSave = vi.fn(async () => undefined)
    render(<ResourceEditorDialog open onClose={vi.fn()} onSave={onSave} />)
    fireEvent.click(within(screen.getByLabelText('Resource type')).getByRole('button', { name: 'YouTube video' }))
    fireEvent.change(document.querySelector<HTMLInputElement>('#resource-url')!, { target: { value: 'https://youtu.be/abcdefghijk' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Video lesson' } })
    expect(await screen.findByTitle('Video lesson preview')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk')
    fireEvent.click(screen.getByRole('button', { name: 'Save resource' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'youtube', youtubeVideoId: 'abcdefghijk' })))

    fireEvent.click(within(screen.getByLabelText('Resource type')).getByRole('button', { name: 'Link' }))
    fireEvent.change(document.querySelector<HTMLInputElement>('#resource-url')!, { target: { value: 'http://example.com' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Reference' } })
    expect(screen.getByRole('button', { name: 'Save resource' })).toBeDisabled()
    expect(screen.getAllByText(/opens in a new tab/)).toHaveLength(2)

    fireEvent.click(within(screen.getByLabelText('Resource type')).getByRole('button', { name: 'Note' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Class notes' } })
    fireEvent.change(document.querySelector<HTMLTextAreaElement>('#resource-body')!, { target: { value: '<p>Plain text</p>' } })
    expect(screen.getByText('Plain text only, no HTML.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save resource' }))
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith({ type: 'text', title: 'Class notes', body: '<p>Plain text</p>' }))
  })
})
