import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAccountNotRegisteredError, mapFirebaseAuthError } from './authErrors'
import { signInWithEmail, signInWithGoogle } from './authService'
import { clearAccountNotRegisteredMark, hasAccountNotRegisteredMark } from './notRegisteredMark'
import { saveRoleIntent, type UserRole } from './roleIntent'
import { useAuth } from './useAuth'
import { validateSignin, type AuthFieldErrors } from './validation'

/** Sign-in state and actions, shared by the desktop page and the phone screen. */
export function useSigninForm(role: UserRole) {
  const { authError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  /** Goes up by one on every submit that fails validation; the phone screen uses it to focus the first invalid field. */
  const [invalidCount, setInvalidCount] = useState(0)
  const navigate = useNavigate()
  const [notRegistered, setNotRegistered] = useState(() => hasAccountNotRegisteredMark())

  useEffect(() => { clearAccountNotRegisteredMark() }, [])

  function changeEmail(value: string) {
    setEmail(value)
    setErrors((previous) => ({ ...previous, email: undefined }))
  }

  function changePassword(value: string) {
    setPassword(value)
    setErrors((previous) => ({ ...previous, password: undefined }))
  }

  function handleSignUpInstead() {
    saveRoleIntent({ role, mode: 'signup' })
    navigate('/signup?mode=signup')
  }

  async function handleSignin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const validationErrors = validateSignin(email, password)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) {
      setInvalidCount((count) => count + 1)
      return
    }

    busyRef.current = true
    setBusy(true)
    setRequestError(null)
    clearAuthError()
    try {
      await signInWithEmail(email.trim(), password)
    } catch (error) {
      if (isAccountNotRegisteredError(error)) setNotRegistered(true)
      else setRequestError(mapFirebaseAuthError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleGoogle() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setRequestError(null)
    clearAuthError()
    try {
      await signInWithGoogle({ requireExistingAccount: true })
    } catch (error) {
      if (isAccountNotRegisteredError(error)) setNotRegistered(true)
      else setRequestError(mapFirebaseAuthError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return {
    role,
    email,
    password,
    errors,
    requestError,
    authError,
    busy,
    showPassword,
    toggleShowPassword: () => setShowPassword((visible) => !visible),
    notRegistered,
    dismissNotRegistered: () => setNotRegistered(false),
    invalidCount,
    changeEmail,
    changePassword,
    handleSignUpInstead,
    handleSignin,
    handleGoogle,
  }
}

export type SigninForm = ReturnType<typeof useSigninForm>
