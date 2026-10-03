import { useId, type TextareaHTMLAttributes } from 'react'
import { CircleAlert } from 'lucide-react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
  error?: string
}

export function Textarea({ label, hint, error, id, className = '', ...props }: TextareaProps) {
  const generatedId = useId()
  const controlId = id ?? props.name ?? generatedId
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return <label className="field" htmlFor={controlId}><span className="field__label">{label}</span><textarea {...props} id={controlId} className={`field__control field__control--textarea ${className}`.trim()} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={[props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined} />{hint && <span id={hintId} className="field__hint">{hint}</span>}{error && <span id={errorId} className="field__error" role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</span>}</label>
}
