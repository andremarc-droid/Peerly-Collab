import { CircleAlert } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, id, className = '', 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...inputProps }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? inputProps.name ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedByIds = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input {...inputProps} className={`field__control ${className}`.trim()} id={inputId} aria-invalid={error ? true : ariaInvalid} aria-describedby={describedByIds} />
      {hint && <span className="field__hint" id={hintId}>{hint}</span>}
      {error && <span className="field__error" id={errorId} role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</span>}
    </label>
  )
}
