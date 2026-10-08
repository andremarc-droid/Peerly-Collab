import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareDocuments, type ExtractedDocument, type PrepareDocumentsResult } from '../../documents/extractDocument'
import type { SendInput } from '../useChatbot'
import { Composer } from './Composer'

vi.mock('../../documents/extractDocument', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../documents/extractDocument')>()),
  prepareDocuments: vi.fn(),
}))

const prepare = vi.mocked(prepareDocuments)

function readyDocument(name: string): ExtractedDocument {
  return { id: name, name, kind: 'pdf', text: 'Chapter text about cells.', truncated: false }
}

function setup(options: { allowDocuments?: boolean } = {}) {
  const onSend = vi.fn<(input: SendInput) => boolean>(() => true)
  render(<Composer disabled={false} busy={false} allowDocuments={options.allowDocuments} onSend={onSend} onStop={vi.fn()} />)
  const box = screen.getByLabelText('Message to the AI tutor') as HTMLTextAreaElement
  return { onSend, box }
}

/** The image picker's input comes first in the page; the document picker's input is the second one. */
function pickDocuments(files: File[]) {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  fireEvent.change(inputs[1], { target: { files } })
}

const pdf = () => new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })

describe('Composer documents', () => {
  beforeEach(() => {
    prepare.mockResolvedValue({ documents: [readyDocument('notes.pdf')], errors: [] })
  })
  afterEach(cleanup)

  it('shows the picked document and lets the learner remove it', async () => {
    setup()
    const file = pdf()
    pickDocuments([file])

    expect(await screen.findByText('notes.pdf')).toBeInTheDocument()
    expect(prepare.mock.calls[0].slice(0, 3)).toEqual([[file], 0, 2])

    fireEvent.click(screen.getByRole('button', { name: 'Remove document notes.pdf' }))
    expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument()
  })

  it('sends a document on its own, without the text of the file in the draft, and clears it afterwards', async () => {
    const { onSend, box } = setup()
    pickDocuments([pdf()])
    await screen.findByText('notes.pdf')

    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeEnabled()
    fireEvent.click(send)

    expect(onSend).toHaveBeenCalledWith({
      text: '',
      images: [],
      documents: [{ id: 'notes.pdf', name: 'notes.pdf', text: 'Chapter text about cells.', truncated: false }],
    })
    expect(box.value).toBe('')
    expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument()
  })

  it('keeps the document when the message was not accepted', async () => {
    const { onSend } = setup()
    onSend.mockReturnValue(false)
    pickDocuments([pdf()])
    await screen.findByText('notes.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('notes.pdf')).toBeInTheDocument()
  })

  it('explains why a file could not be added and does not allow sending it', async () => {
    prepare.mockResolvedValue({ documents: [], errors: ['scan.pdf: No selectable text was found.'] })
    setup()
    pickDocuments([pdf()])

    expect(await screen.findByText(/No selectable text was found/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('disables the picker once the per-message limit is reached', async () => {
    prepare.mockResolvedValue({ documents: [readyDocument('a.pdf'), readyDocument('b.pdf')], errors: [] })
    setup()
    pickDocuments([pdf(), pdf()])
    await screen.findByText('b.pdf')

    expect(screen.getByRole('button', { name: 'Document (2 of 2)' })).toBeDisabled()
  })

  it('waits for documents that are still being read before allowing Send', async () => {
    let release: (result: PrepareDocumentsResult) => void = () => undefined
    prepare.mockReturnValue(
      new Promise<PrepareDocumentsResult>((resolve) => {
        release = resolve
      }),
    )
    const { box } = setup()

    pickDocuments([pdf()])
    fireEvent.change(box, { target: { value: 'Summarize it' } })
    expect(await screen.findByText('Reading…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    await act(async () => {
      release({ documents: [readyDocument('notes.pdf')], errors: [] })
    })
    await screen.findByText('notes.pdf')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('is switched off, with a reason, in shared conversations', () => {
    setup({ allowDocuments: false })

    expect(screen.getByRole('button', { name: 'Document (0 of 2)' })).toBeDisabled()
    expect(screen.getByText(/not available in shared conversations/)).toBeInTheDocument()
  })
})
