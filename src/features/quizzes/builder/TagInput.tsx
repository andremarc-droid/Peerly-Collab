import { X } from 'lucide-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { normalizeAnswer } from '../grading/normalize'

interface TagInputProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  /** Decides what counts as a duplicate, using the same rules as grading. */
  caseSensitive: boolean
  id?: string
  hint?: string
  error?: string
  placeholder?: string
}

/**
 * Collects a list of short answers as removable tags.
 * Text only becomes a tag when the person presses Enter, so a half-typed answer is never added by accident.
 */
export function TagInput({ label, values, onChange, caseSensitive, id, hint, error, placeholder }: TagInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')

  function commit() {
    const candidate = text.trim()
    if (!candidate) return
    const key = normalizeAnswer(candidate, caseSensitive)
    if (!key) { setNotice('That answer has no visible characters.'); return }
    if (values.some((value) => normalizeAnswer(value, caseSensitive) === key)) {
      setNotice(`“${candidate}” is already in the list${caseSensitive ? '' : ' (capitalization is ignored)'}.`)
      return
    }
    onChange([...values, candidate])
    setText('')
    setNotice('')
  }

  function remove(index: number) {
    onChange(values.filter((_, valueIndex) => valueIndex !== index))
    inputRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // Keep Enter from submitting a surrounding form or triggering page shortcuts. Don't interrupt IME composition.
      if (event.nativeEvent.isComposing) return
      event.preventDefault()
      commit()
      return
    }
    if (event.key === 'Backspace' && text === '' && values.length > 0) remove(values.length - 1)
  }

  const pending = text.trim()
  return <div className="field">
    <label className="field__label" htmlFor={inputId}>{label}</label>
    <div className="field__control flex flex-wrap items-center gap-2" onClick={() => inputRef.current?.focus()}>
      {values.map((value, index) => <span key={`${index}-${value}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-navy-900-12 bg-navy-900-5 py-1 pl-3 pr-1 text-sm text-navy-900">
        <span className="break-words">{value}</span>
        <button type="button" className="icon-button" aria-label={`Remove answer ${value}`} onClick={() => remove(index)}><X size={14} aria-hidden="true" /></button>
      </span>)}
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        className="min-w-[10rem] flex-1 border-0 bg-transparent p-0 outline-none"
        value={text}
        maxLength={200}
        placeholder={values.length === 0 ? placeholder : undefined}
        onChange={(event) => { setText(event.target.value); if (notice) setNotice('') }}
        onKeyDown={onKeyDown}
        aria-invalid={Boolean(error)}
        aria-describedby={hintId}
      />
    </div>
    <span id={hintId} className="field__hint">{hint ?? 'Type an answer and press Enter to add it.'}</span>
    {(pending || notice) && <span className="field__hint" role="status">{notice || `Press Enter to add “${pending}”. It isn’t saved until you do.`}</span>}
    {error && <span className="field__error" role="alert">{error}</span>}
  </div>
}
