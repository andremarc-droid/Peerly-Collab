import { useState, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { DocumentChips, DocumentPicker, useDocumentImport } from '../../documents'
import { MAX_DOCUMENTS_PER_MESSAGE, MAX_MESSAGE_CHARS } from '../constants'
import type { SendInput } from '../useChatbot'
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

/** On phones and tablets the on-screen Enter key should start a new line; sending is done with the Send button. */
function usesTouchKeyboard(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

export function Composer({ disabled, busy, allowDocuments = true, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('')
  const upload = useDocumentImport(MAX_DOCUMENTS_PER_MESSAGE)

  const tooLong = text.length > MAX_MESSAGE_CHARS
  const hasContent = text.trim().length > 0 || upload.documents.length > 0
  const canSend = !disabled && !busy && !upload.preparing && hasContent && !tooLong

  function submit() {
    if (!canSend) return
    const documents = upload.documents.map(({ id, name, text: body, truncated }) => ({ id, name, text: body, truncated }))
    // Images can no longer be attached, so `images` is always empty (the field stays for the send API and saved chats).
    // Only include `documents` when there are some, so messages without them look exactly as before.
    const input: SendInput = documents.length > 0 ? { text, images: [], documents } : { text, images: [] }
    if (onSend(input)) {
      setText('')
      upload.clear()
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !usesTouchKeyboard()) {
      event.preventDefault()
      submit()
    }
  }

  const showHint = tooLong || !allowDocuments

  return (
    <div className="border-t border-navy-900-12 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
      <div className="grid gap-2 rounded-[1.75rem] border border-navy-900-30 bg-white p-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy-800">
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
          rows={Math.min(6, Math.max(1, text.split('\n').length))}
          placeholder={disabled ? 'The AI tutor is not available.' : 'Ask the tutor…'}
          aria-label="Message to the AI tutor"
          aria-invalid={tooLong}
          disabled={disabled}
          enterKeyHint="enter"
          className="field-sizing-content block max-h-40 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-6 text-navy-900 outline-none placeholder:text-navy-800-72 disabled:cursor-not-allowed"
        />

        <div className="flex items-center gap-2">
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
