import { useId, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
}

export function Input({ label, hint, id, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? props.name ?? generatedId
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input className="field__control" id={inputId} {...props} />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}
