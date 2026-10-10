import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_MESSAGE_CHARS } from '../constants'
import type { SendInput } from '../useChatbot'
import { Composer } from './Composer'

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

describe('Composer', () => {
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

  describe('images', () => {
    it('does not offer to attach images', () => {
      setup()
      expect(screen.queryByRole('button', { name: /Attach image/ })).not.toBeInTheDocument()
    })

    it('ignores an image pasted into the message box', () => {
      const { onSend, box } = setup()
      const file = new File(['pixels'], 'notes.png', { type: 'image/png' })
      fireEvent.paste(box, { clipboardData: { files: [file] } })

      expect(screen.queryByAltText('notes.png')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
      fireEvent.keyDown(box, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    })
  })

  describe('unavailable and busy states', () => {
    it('disables everything when the tutor is not available', () => {
      const { box } = setup({ disabled: true })
      expect(box).toBeDisabled()
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
