import { useRef, useState, type FormEvent } from 'react'
import { mapFirebaseAuthError } from './authErrors'
import { sendPasswordReset } from './authService'
import { useAuth } from './useAuth'
import { validateEmail } from './validation'

/** Password-reset state and actions, shared by the desktop page and the phone screen. */
export function useForgotPassword() {
  const { authError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [requestError, setRequestError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Goes up by one on every submit that fails validation; the phone screen uses it to focus the field. */
  const [invalidCount, setInvalidCount] = useState(0)
  const busyRef = useRef(false)

  function changeEmail(value: string) {
    setEmail(value)
    setEmailError(undefined)
    setSent(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const validationError = validateEmail(email)
    setEmailError(validationError)
    if (validationError) {
      setInvalidCount((count) => count + 1)
      return
    }

    busyRef.current = true
    setBusy(true)
    setRequestError(null)
    clearAuthError()
    try {
      await sendPasswordReset(email.trim())
      setSent(true)
    } catch (error) {
      setRequestError(mapFirebaseAuthError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { email, emailError, requestError, authError, sent, busy, invalidCount, changeEmail, handleSubmit }
}

export type ForgotPasswordForm = ReturnType<typeof useForgotPassword>
