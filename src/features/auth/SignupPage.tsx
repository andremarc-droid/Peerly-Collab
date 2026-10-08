import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { AccountTypeHint, AuthCard, AuthShell, GoogleSignInButton, PasswordField, RoleChip } from './AuthChrome'
import { AuthModeBadge } from './AuthModeBadge'
import { mapFirebaseAuthError } from './authErrors'
import { createEmailAccount, signInWithGoogle } from './authService'
import { useAuth } from './useAuth'
import { getPasswordStrength, validateAge, validateSignup, MAX_STUDENT_AGE, MIN_STUDENT_AGE, type AuthFieldErrors, type SignupValues } from './validation'
import type { RoleIntent, UserRole } from './roleIntent'
import { readRoleIntent, saveRoleIntent } from './roleIntent'

const initialValues: SignupValues = { name: '', email: '', password: '', confirmPassword: '', age: '' }
const strengthHint = { empty: 'Use at least 8 characters.', weak: 'Weak · add more characters.', fair: 'Getting stronger · add a number or symbol.', strong: 'Strong password.' }

export function SignupPage() {
  const intent = readRoleIntent()
  if (!intent || intent.mode !== 'signup') return <Navigate to="/role?mode=signup" replace />
  return <SignupForm intent={intent} role={intent.role} />
}

function SignupForm({ intent, role }: { intent: RoleIntent; role: UserRole }) {
  const isStudent = role === 'student'
  const { authError, clearAuthError } = useAuth()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

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
    if (Object.keys(validationErrors).length) return

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

  const passwordStrength = getPasswordStrength(values.password)
  return (
    <AuthShell>
      <AuthCard>
        <div className="auth-card__heading">
          <AuthModeBadge mode="signup" step={2} totalSteps={2} />
          <RoleChip role={role} mode="signup" />
          <AccountTypeHint role={role} />
          <h1>Create your account</h1>
          <p>Make a little room for better practice.</p>
        </div>
        {(requestError || authError) && <Alert tone="error" label="We couldn’t create your account">{requestError ?? authError}</Alert>}
        {isStudent && (
          <Input
            label="Age"
            name="age"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Your age"
            maxLength={3}
            value={values.age ?? ''}
            onChange={(event) => update('age', event.target.value.replace(/\D/g, ''))}
            error={errors.age}
            hint={`Required for student accounts, including Google sign-up (${MIN_STUDENT_AGE}–${MAX_STUDENT_AGE}).`}
            disabled={busy}
          />
        )}
        <GoogleSignInButton onClick={handleGoogle} disabled={busy} />
        <div className="auth-divider"><span />or continue with email<span /></div>
        <form className="auth-form" noValidate onSubmit={handleSignup}>
          <Input label="Name" name="name" autoComplete="name" placeholder="Your name" value={values.name} onChange={(event) => update('name', event.target.value)} error={errors.name} disabled={busy} />
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={(event) => update('email', event.target.value)} error={errors.email} disabled={busy} />
          <PasswordField label="Password" name="new-password" autoComplete="new-password" value={values.password} onChange={(value) => update('password', value)} error={errors.password} hint={strengthHint[passwordStrength]} visible={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={busy} />
          <PasswordField label="Confirm password" name="confirm-password" autoComplete="new-password" value={values.confirmPassword} onChange={(value) => update('confirmPassword', value)} error={errors.confirmPassword} visible={showConfirmation} onToggle={() => setShowConfirmation(!showConfirmation)} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer">Already have an account? <Link to="/role?mode=signin">Sign in</Link></p>
      </AuthCard>
    </AuthShell>
  )
}
