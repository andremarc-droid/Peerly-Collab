import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send, Square, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { toDataUrl } from '../../canvas/imageProcessing'
import { MAX_IMAGES_PER_MESSAGE, MAX_MESSAGE_CHARS } from '../constants'
import { prepareChatImages } from '../images'
import type { SendInput } from '../useChatbot'
import type { ChatImage } from '../types'

interface ComposerProps {
  disabled: boolean
  busy: boolean
  /** Returns true when the message was accepted, so the draft can be cleared. */
  onSend: (input: SendInput) => boolean
  onStop: () => void
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

export function Composer({ disabled, busy, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [attachErrors, setAttachErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const tooLong = text.length > MAX_MESSAGE_CHARS
  const hasContent = text.trim().length > 0 || images.length > 0
  const canSend = !disabled && !busy && !preparing && hasContent && !tooLong
  const canAttach = !disabled && !preparing && images.length < MAX_IMAGES_PER_MESSAGE

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    setPreparing(true)
    try {
      const result = await prepareChatImages(files, images.length)
      setImages((previous) => [...previous, ...result.images].slice(0, MAX_IMAGES_PER_MESSAGE))
      setAttachErrors(result.errors)
    } finally {
      setPreparing(false)
    }
  }

  function submit() {
    if (!canSend) return
    if (onSend({ text, images })) {
      setText('')
      setImages([])
      setAttachErrors([])
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
    if (pasted.length === 0) return
    event.preventDefault()
    void addFiles(pasted)
  }

  return (
    <div className="grid gap-3 border-t border-navy-900-12 p-4">
      {images.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-3 p-0" aria-label="Images to send">
          {images.map((image) => (
            <li key={image.id} className="relative">
              <img
                src={toDataUrl(image.mimeType, image.data)}
                alt={image.name}
                className="h-20 w-20 rounded-2xl border border-navy-900-12 object-cover"
              />
              <button
                type="button"
                onClick={() => setImages((previous) => previous.filter((item) => item.id !== image.id))}
                className="absolute -right-2 -top-2 inline-flex size-8 items-center justify-center rounded-full border border-navy-900-30 bg-white text-navy-900 hover:bg-navy-700-07"
                aria-label={`Remove image ${image.name}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {attachErrors.length > 0 && (
        <Alert tone="warning" label="Some images were not added">
          {attachErrors.join(' ')}
        </Alert>
      )}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={Math.min(6, Math.max(2, text.split('\n').length))}
        placeholder={disabled ? 'The AI tutor is not available.' : 'Ask a question, or attach a photo of your work…'}
        aria-label="Message to the AI tutor"
        aria-invalid={tooLong}
        disabled={disabled}
        className="field__control field__control--textarea resize-none"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-navy-800-72">
          {tooLong ? (
            <span className="font-semibold text-navy-900" role="alert">
              {text.length}/{MAX_MESSAGE_CHARS} characters. Please shorten your message.
            </span>
          ) : (
            'Enter to send · Shift+Enter for a new line'
          )}
        </p>

        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={!canAttach}
            aria-label={`Attach image (${images.length} of ${MAX_IMAGES_PER_MESSAGE})`}
          >
            <Paperclip size={18} aria-hidden="true" />
            <span>{preparing ? 'Preparing…' : 'Attach'}</span>
          </Button>

          {busy ? (
            <Button type="button" variant="secondary" onClick={onStop}>
              <Square size={16} aria-hidden="true" />
              <span>Stop</span>
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={submit} disabled={!canSend}>
              <Send size={16} aria-hidden="true" />
              <span>Send</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
