import { useId, type SelectHTMLAttributes } from 'react'
import { ChevronDown, CircleAlert } from 'lucide-react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
  options: Array<{ label: string; value: string }>
}

export function Select({ label, hint, error, options, id, className = '', ...props }: SelectProps) {
  const generatedId = useId()
  const controlId = id ?? props.name ?? generatedId
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  return <label className="field" htmlFor={controlId}><span className="field__label">{label}</span><span className="select-wrap"><select {...props} id={controlId} className={`field__control field__control--select ${className}`.trim()} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={[props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={17} aria-hidden="true" /></span>{hint && <span id={hintId} className="field__hint">{hint}</span>}{error && <span id={errorId} className="field__error" role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</span>}</label>
}
