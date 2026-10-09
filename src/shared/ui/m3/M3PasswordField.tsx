import { Eye, EyeOff } from 'lucide-react'
import { useId } from 'react'
import { M3TextField, type M3TextFieldProps } from './M3TextField'

interface M3PasswordFieldProps extends Omit<M3TextFieldProps, 'type' | 'trailing'> {
  visible: boolean
  onToggle: () => void
}

/** Password field with a 48px show/hide button inside it. The button's name says what it will do. */
export function M3PasswordField({ visible, onToggle, label, id, disabled, ...fieldProps }: M3PasswordFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const action = `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`

  return (
    <M3TextField
      {...fieldProps}
      id={inputId}
      label={label}
      type={visible ? 'text' : 'password'}
      disabled={disabled}
      trailing={
        <button
          type="button"
          aria-label={action}
          aria-controls={inputId}
          onClick={onToggle}
          disabled={disabled}
          className="m3-press m3-press--icon inline-flex size-12 items-center justify-center rounded-full text-navy-900 disabled:cursor-not-allowed"
        >
          {visible ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}
        </button>
      }
    />
  )
}
