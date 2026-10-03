import { useId, type InputHTMLAttributes } from 'react'

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
}

export function Switch({ label, hint, id, ...props }: SwitchProps) {
  const generatedId = useId()
  const controlId = id ?? props.name ?? generatedId
  return <label className="switch" htmlFor={controlId}><input {...props} id={controlId} type="checkbox" role="switch" /><span className="switch__track" aria-hidden="true"><span /></span><span className="switch__copy"><strong>{label}</strong>{hint && <small>{hint}</small>}</span></label>
}
