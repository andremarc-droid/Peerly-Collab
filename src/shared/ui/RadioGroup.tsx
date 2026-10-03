import { useId, type InputHTMLAttributes } from 'react'
import { CircleAlert } from 'lucide-react'

interface RadioOption { label: string; value: string; hint?: string }
interface RadioGroupProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  label: string
  name: string
  value: string
  options: RadioOption[]
  onChange: (value: string) => void
  hint?: string
  error?: string
}

export function RadioGroup({ label, name, value, options, onChange, hint, error, disabled }: RadioGroupProps) {
  const groupId = useId()
  return <fieldset className="radio-group" aria-describedby={[hint && `${groupId}-hint`, error && `${groupId}-error`].filter(Boolean).join(' ') || undefined}><legend>{label}</legend><div className="radio-group__options">{options.map((option) => <label className="choice-control" key={option.value}><input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} disabled={disabled} /><span className="choice-control__mark choice-control__mark--radio" aria-hidden="true" /><span className="choice-control__copy"><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span></label>)}</div>{hint && <span className="field__hint" id={`${groupId}-hint`}>{hint}</span>}{error && <span className="field__error" id={`${groupId}-error`} role="alert"><CircleAlert size={14} aria-hidden="true" />{error}</span>}</fieldset>
}
