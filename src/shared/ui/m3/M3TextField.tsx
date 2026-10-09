import { CircleAlert } from 'lucide-react'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

export interface M3TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  /** Control shown inside the field on the right, such as the show/hide password button. */
  trailing?: ReactNode
}

/**
 * Material-style outlined text field for the phone screens: label above, 56px tall, 16px radius.
 * The outline colors and the 2px focus outline live in `.m3-field` (see `m3.css`).
 * The hint and the error are tied to the input with `aria-describedby`; the error also announces itself.
 */
export function M3TextField({ label, hint, error, trailing, id, className = '', ...inputProps }: M3TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [inputProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined
  // One padding class pair per case: `px-4` and `pr-14` together depend on stylesheet order.
  const padding = trailing ? 'pl-4 pr-14' : 'px-4'

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="px-1 text-sm font-semibold leading-5 text-navy-900">
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`m3-field h-14 w-full min-w-0 rounded-2xl border bg-white ${padding} text-base text-navy-900 placeholder:text-navy-800-72 disabled:cursor-not-allowed disabled:bg-navy-900-08 ${className}`.trim()}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && (
        <p id={hintId} className="m-0 px-4 text-sm leading-5 text-navy-900">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="m-0 flex items-start gap-1.5 px-4 text-sm font-medium leading-5 text-feedback-error">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
