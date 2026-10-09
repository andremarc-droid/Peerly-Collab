import { useRef, useState, type FormEvent } from 'react'
import { mapFirebaseAuthError } from './authErrors'
import { createEmailAccount, signInWithGoogle } from './authService'
import { saveRoleIntent, type RoleIntent } from './roleIntent'
import { useAuth } from './useAuth'
import { getPasswordStrength, validateAge, validateSignup, type AuthFieldErrors, type SignupValues } from './validation'

const initialValues: SignupValues = { name: '', email: '', password: '', confirmPassword: '', age: '' }

export const strengthHint = {
  empty: 'Use at least 8 characters.',
  weak: 'Weak · add more characters.',
  fair: 'Getting stronger · add a number or symbol.',
  strong: 'Strong password.',
}

/** Sign-up state and actions, shared by the desktop page and the phone screen. */
export function useSignupForm(intent: RoleIntent) {
  const role = intent.role
  const isStudent = role === 'student'
  const { authError, clearAuthError } = useAuth()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  /** Goes up by one on every submit that fails validation; the phone screen uses it to focus the first invalid field. */
  const [invalidCount, setInvalidCount] = useState(0)

  function update(field: keyof SignupValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
    setRequestError(null)
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const validationErrors = validateSignup(values, { requireAge: isStudent })
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
      // The profile is created right after sign-up, so the age travels with the role intent.
      if (isStudent) saveRoleIntent({ ...intent, age: Number(values.age) })
      await createEmailAccount(values.name, values.email.trim(), values.password)
    } catch (error) {
      setRequestError(mapFirebaseAuthError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleGoogle() {
    if (busyRef.current) return
    if (isStudent) {
      // Google sign-up skips this form, so the age must be valid before the popup opens.
      const ageError = validateAge(values.age)
      if (ageError) {
        setErrors((previous) => ({ ...previous, age: ageError }))
        setInvalidCount((count) => count + 1)
        return
      }
    }
    busyRef.current = true
    setBusy(true)
    setRequestError(null)
    clearAuthError()
    try {
      if (isStudent) saveRoleIntent({ ...intent, age: Number(values.age) })
      await signInWithGoogle()
    } catch (error) {
      setRequestError(mapFirebaseAuthError(error))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return {
    role,
    isStudent,
    values,
    errors,
    requestError,
    authError,
    busy,
    showPassword,
    toggleShowPassword: () => setShowPassword((visible) => !visible),
    showConfirmation,
    toggleShowConfirmation: () => setShowConfirmation((visible) => !visible),
    passwordHint: strengthHint[getPasswordStrength(values.password)],
    invalidCount,
    update,
    handleSignup,
    handleGoogle,
  }
}

export type SignupForm = ReturnType<typeof useSignupForm>
