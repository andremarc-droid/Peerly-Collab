import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send, Square, X } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { toDataUrl } from '../../canvas/imageProcessing'
import { DocumentChips, DocumentPicker, useDocumentImport } from '../../documents'
import { MAX_DOCUMENTS_PER_MESSAGE, MAX_IMAGES_PER_MESSAGE, MAX_MESSAGE_CHARS } from '../constants'
import { prepareChatImages } from '../images'
import type { SendInput } from '../useChatbot'
import type { ChatImage } from '../types'
import '../chatbot.css'

interface ComposerProps {
  disabled: boolean
  busy: boolean
  /** False in shared conversations, where documents would not sync to the other people. Defaults to true. */
  allowDocuments?: boolean
  /** Returns true when the message was accepted, so the draft can be cleared. */
  onSend: (input: SendInput) => boolean
  onStop: () => void
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

/** On phones and tablets the on-screen Enter key should start a new line; sending is done with the Send button. */
function usesTouchKeyboard(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Composer({ disabled, busy, allowDocuments = true, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [attachErrors, setAttachErrors] = useState<string[]>([])
  const [preparing, setPreparing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const upload = useDocumentImport(MAX_DOCUMENTS_PER_MESSAGE)

  const tooLong = text.length > MAX_MESSAGE_CHARS
  const hasContent = text.trim().length > 0 || images.length > 0 || upload.documents.length > 0
  const canSend = !disabled && !busy && !preparing && !upload.preparing && hasContent && !tooLong
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
    const documents = upload.documents.map(({ id, name, text: body, truncated }) => ({ id, name, text: body, truncated }))
    // Only include `documents` when there are some, so messages without them look exactly as before.
    const input: SendInput = documents.length > 0 ? { text, images, documents } : { text, images }
    if (onSend(input)) {
      setText('')
      setImages([])
      setAttachErrors([])
      upload.clear()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !usesTouchKeyboard()) {
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

  const showHint = tooLong || !allowDocuments

  return (
    <div className="border-t border-navy-900-12 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
      <div className="grid gap-2 rounded-[1.75rem] border border-navy-900-30 bg-white p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy-800">
        {images.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-3 px-2 pt-2" aria-label="Images to send">
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
                  className="absolute -right-2 -top-2 inline-flex size-8 items-center justify-center rounded-full border border-navy-900-30 bg-white text-navy-900 hover:bg-navy-700-07 before:absolute before:-inset-2 before:content-['']"
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

        <DocumentChips
          documents={upload.documents}
          onRemove={upload.remove}
          disabled={disabled}
          label="Documents to send"
        />

        {upload.errors.length > 0 && (
          <Alert tone="warning" label="Some documents were not added">
            {upload.errors.join(' ')}
          </Alert>
        )}

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder={disabled ? 'The AI tutor is not available.' : 'Ask the tutor…'}
          aria-label="Message to the AI tutor"
          aria-invalid={tooLong}
          disabled={disabled}
          enterKeyHint="enter"
          className="field-sizing-content block max-h-40 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 text-navy-900 outline-none placeholder:text-navy-800-72 disabled:cursor-not-allowed"
        />

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
            className="tutor-icon-btn tutor-icon-btn--labelled"
            onClick={() => fileInput.current?.click()}
            disabled={!canAttach}
            aria-label={`Attach image (${images.length} of ${MAX_IMAGES_PER_MESSAGE})`}
          >
            <Paperclip size={18} aria-hidden="true" className={preparing ? 'animate-pulse' : undefined} />
            <span className="hidden sm:inline">{preparing ? 'Preparing…' : 'Attach'}</span>
          </Button>

          <DocumentPicker
            onFiles={(files) => void upload.addFiles(files)}
            count={upload.documents.length}
            max={MAX_DOCUMENTS_PER_MESSAGE}
            preparing={upload.preparing}
            disabled={disabled || !allowDocuments}
            text="Document"
            className="tutor-icon-btn tutor-icon-btn--labelled"
            labelClassName="hidden sm:inline"
          />

          <div className="ml-auto">
            {busy ? (
              <Button type="button" variant="secondary" className="tutor-icon-btn tutor-icon-btn--labelled" onClick={onStop} aria-label="Stop">
                <Square size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Stop</span>
              </Button>
            ) : (
              <Button type="button" variant="primary" className="tutor-icon-btn tutor-icon-btn--labelled" onClick={submit} disabled={!canSend} aria-label="Send">
                <Send size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className={`m-0 px-2 pt-2 text-sm text-navy-800-72 ${showHint ? '' : 'hidden sm:block'}`}>
        {tooLong ? (
          <span className="font-semibold text-navy-900" role="alert">
            {text.length}/{MAX_MESSAGE_CHARS} characters. Please shorten your message.
          </span>
        ) : (
          'Enter to send · Shift+Enter for a new line'
        )}
        {!tooLong && !allowDocuments && ' Documents are not available in shared conversations.'}
      </p>
    </div>
  )
}
