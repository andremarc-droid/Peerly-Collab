import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_MESSAGE_CHARS } from '../constants'
import { prepareChatImages, type PrepareImagesResult } from '../images'
import { makeImage } from '../testFactories'
import type { SendInput } from '../useChatbot'
import { Composer } from './Composer'

vi.mock('../images', () => ({ prepareChatImages: vi.fn() }))

const prepare = vi.mocked(prepareChatImages)

function setup(options: { accept?: boolean; disabled?: boolean; busy?: boolean } = {}) {
  const onSend = vi.fn<(input: SendInput) => boolean>(() => options.accept ?? true)
  const onStop = vi.fn()
  render(<Composer disabled={options.disabled ?? false} busy={options.busy ?? false} onSend={onSend} onStop={onStop} />)
  const box = screen.getByLabelText('Message to the AI tutor') as HTMLTextAreaElement
  return { onSend, onStop, box }
}

function type(box: HTMLTextAreaElement, value: string) {
  fireEvent.change(box, { target: { value } })
}

function pickFiles(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files } })
}

const photo = () => new File(['pixels'], 'notes.png', { type: 'image/png' })

describe('Composer', () => {
  beforeEach(() => {
    prepare.mockResolvedValue({ images: [makeImage('notes.jpg')], errors: [] })
  })
  afterEach(cleanup)

  describe('sending text', () => {
    it('sends on Enter and clears the draft', () => {
      const { onSend, box } = setup()
      type(box, 'Explain mitosis')
      fireEvent.keyDown(box, { key: 'Enter' })

      expect(onSend).toHaveBeenCalledWith({ text: 'Explain mitosis', images: [] })
      expect(box.value).toBe('')
    })

    it('starts a new line on Shift+Enter instead of sending', () => {
      const { onSend, box } = setup()
      type(box, 'line one')
      fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })

      expect(onSend).not.toHaveBeenCalled()
      expect(box.value).toBe('line one')
    })

    it('keeps the draft when the message was not accepted', () => {
      const { onSend, box } = setup({ accept: false })
      type(box, 'keep me')
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))

      expect(onSend).toHaveBeenCalledTimes(1)
      expect(box.value).toBe('keep me')
    })

    it('cannot send an empty or whitespace-only message', () => {
      const { onSend, box } = setup()
      const send = screen.getByRole('button', { name: 'Send' })
      expect(send).toBeDisabled()

      type(box, '   ')
      expect(send).toBeDisabled()
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()

      type(box, 'hello')
      expect(send).toBeEnabled()
    })

    it('blocks messages over the character limit and says so', () => {
      const { onSend, box } = setup()
      type(box, 'a'.repeat(MAX_MESSAGE_CHARS + 1))

      expect(screen.getByRole('alert')).toHaveTextContent(`${MAX_MESSAGE_CHARS + 1}/${MAX_MESSAGE_CHARS} characters`)
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    })
  })

  describe('attaching images', () => {
    it('shows a preview of the picked image and lets the learner remove it', async () => {
      setup()
      const file = photo()
      pickFiles([file])

      const preview = await screen.findByAltText('notes.jpg')
      expect(preview).toHaveAttribute('src', 'data:image/jpeg;base64,QUJD')
      expect(prepare).toHaveBeenCalledWith([file], 0)

      fireEvent.click(screen.getByRole('button', { name: 'Remove image notes.jpg' }))
      expect(screen.queryByAltText('notes.jpg')).not.toBeInTheDocument()
    })

    it('sends an image on its own and clears the previews afterwards', async () => {
      const { onSend } = setup()
      pickFiles([photo()])
      await screen.findByAltText('notes.jpg')

      const send = screen.getByRole('button', { name: 'Send' })
      expect(send).toBeEnabled()
      fireEvent.click(send)

      expect(onSend).toHaveBeenCalledWith({ text: '', images: [expect.objectContaining({ name: 'notes.jpg' })] })
      expect(screen.queryByAltText('notes.jpg')).not.toBeInTheDocument()
    })

    it('adds an image pasted into the message box, but ignores pasted text', async () => {
      const { box } = setup()
      fireEvent.paste(box, { clipboardData: { files: [] } })
      expect(prepare).not.toHaveBeenCalled()

      const file = photo()
      fireEvent.paste(box, { clipboardData: { files: [file] } })
      expect(await screen.findByAltText('notes.jpg')).toBeInTheDocument()
      expect(prepare).toHaveBeenCalledWith([file], 0)
    })

    it('disables Attach once the per-message limit is reached', async () => {
      prepare.mockResolvedValue({ images: [makeImage('a.jpg'), makeImage('b.jpg')], errors: [] })
      setup()
      pickFiles([photo(), photo()])
      await screen.findByAltText('b.jpg')

      expect(screen.getByRole('button', { name: 'Attach image (2 of 2)' })).toBeDisabled()
    })

    it('tells the learner when an image was rejected', async () => {
      prepare.mockResolvedValue({ images: [], errors: ['big.png: Image must be 10 MB or smaller'] })
      setup()
      pickFiles([photo()])

      expect(await screen.findByText(/Image must be 10 MB or smaller/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('waits for images that are still being prepared before allowing Send', async () => {
      let release: (result: PrepareImagesResult) => void = () => undefined
      prepare.mockReturnValue(
        new Promise<PrepareImagesResult>((resolve) => {
          release = resolve
        }),
      )
      const { box } = setup()

      pickFiles([photo()])
      type(box, 'What is this?')
      expect(await screen.findByText('Preparing…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

      await act(async () => {
        release({ images: [makeImage('notes.jpg')], errors: [] })
      })
      await screen.findByAltText('notes.jpg')
      expect(screen.queryByText('Preparing…')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    })
  })

  describe('unavailable and busy states', () => {
    it('disables everything when the tutor is not available', () => {
      const { box } = setup({ disabled: true })
      expect(box).toBeDisabled()
      expect(screen.getByRole('button', { name: /Attach image/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('shows Stop instead of Send while a reply is being written, and ignores Enter', () => {
      const { onSend, onStop, box } = setup({ busy: true })
      expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()

      type(box, 'another question')
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })
})
