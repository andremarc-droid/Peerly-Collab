import { CircleAlert, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  leadingIcon?: ReactNode
}

export function Input({ label, hint, error, leadingIcon, id, className = '', 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...inputProps }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? inputProps.name ?? generatedId
  const icon = leadingIcon ?? (inputProps.type === 'email' || inputProps.name === 'email'
    ? <Mail size={17} />
    : inputProps.type === 'password' || inputProps.name?.includes('password')
      ? <LockKeyhole size={17} />
      : inputProps.name === 'name' || inputProps.name === 'display-name'
        ? <UserRound size={17} />
        : undefined)
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedByIds = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      {icon ? <span className="field__input-wrap"><span className="field__leading-icon" aria-hidden="true">{icon}</span><input {...inputProps} className={`field__control ${className}`.trim()} id={inputId} aria-invalid={error ? true : ariaInvalid} aria-describedby={describedByIds} /></span> : <input {...inputProps} className={`field__control ${className}`.trim()} id={inputId} aria-invalid={error ? true : ariaInvalid} aria-describedby={describedByIds} />}
      {hint && <span className="field__hint" id={hintId}>{hint}</span>}
      {error && <span className="field__error" id={errorId} role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</span>}
    </label>
  )
}
