import { useRef } from 'react'
import { FileUp } from 'lucide-react'
import { Button, type ButtonVariant } from '../../../shared/ui/Button'
import { DOCUMENT_ACCEPT } from '../constants'

interface DocumentPickerProps {
  onFiles: (files: File[]) => void
  count: number
  max: number
  disabled?: boolean
  preparing?: boolean
  /** Visible button text. */
  text?: string
  variant?: ButtonVariant
  /** Extra classes for the button (for example a compact icon-only style on phones). */
  className?: string
  /** Extra classes for the visible label, so it can be hidden on small screens. The accessible name stays on the button. */
  labelClassName?: string
}

/** A button that opens the file dialog for PDF, Word, PowerPoint, and text files. */
export function DocumentPicker({
  onFiles,
  count,
  max,
  disabled = false,
  preparing = false,
  text = 'Add document',
  variant = 'secondary',
  className,
  labelClassName,
}: DocumentPickerProps) {
  const input = useRef<HTMLInputElement>(null)
  const full = count >= max

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple={max - count > 1}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => input.current?.click()}
        disabled={disabled || preparing || full}
        aria-label={`${text} (${count} of ${max})`}
      >
        <FileUp size={18} aria-hidden="true" />
        <span className={labelClassName}>{preparing ? 'Reading…' : text}</span>
      </Button>
    </>
  )
}
