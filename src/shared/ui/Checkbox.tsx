import { useId, type InputHTMLAttributes } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
}

export function Checkbox({ label, hint, id, ...props }: CheckboxProps) {
  const generatedId = useId()
  const controlId = id ?? props.name ?? generatedId
  return <label className="choice-control" htmlFor={controlId}><input {...props} id={controlId} type="checkbox" /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>{label}</strong>{hint && <small>{hint}</small>}</span></label>
}
