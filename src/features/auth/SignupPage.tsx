import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { AuthGate } from './AuthGate'
import { AccountTypeHint, AuthCard, AuthShell, GoogleSignInButton, PasswordField, RoleChip } from './AuthChrome'
import { mapFirebaseAuthError } from './authErrors'
import { createEmailAccount, signInWithGoogle } from './authService'
import { useAuth } from './useAuth'
import { getPasswordStrength, validateSignup, type AuthFieldErrors, type SignupValues } from './validation'
import type { UserRole } from './roleIntent'

const initialValues: SignupValues = { name: '', email: '', password: '', confirmPassword: '' }
const strengthHint = { empty: 'Use at least 8 characters.', weak: 'Weak · add more characters.', fair: 'Getting stronger · add a number or symbol.', strong: 'Strong password.' }

export function SignupPage() {
  return <AuthGate mode="signup">{(role) => <SignupForm role={role} />}</AuthGate>
}

function SignupForm({ role }: { role: UserRole }) {
  const navigate = useNavigate()
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
    const validationErrors = validateSignup(values)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

    busyRef.current = true
    setBusy(true)
    setRequestError(null)
    clearAuthError()
    try {
      const result = await createEmailAccount(values.name, values.email.trim(), values.password)
      navigate('/welcome', { replace: true, state: { verificationSent: !result.verificationError, verificationError: result.verificationError ? mapFirebaseAuthError(result.verificationError) : null } })
    } catch (error) {
      setRequestError(mapFirebaseAuthError(error))
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
      const result = await signInWithGoogle()
      if (result) navigate('/welcome', { replace: true })
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
          <RoleChip role={role} mode="signup" />
          <AccountTypeHint role={role} />
          <h1>Create your account</h1>
          <p>Make a little room for better practice.</p>
        </div>
        {(requestError || authError) && <Alert tone="error" label="We couldn’t create your account">{requestError ?? authError}</Alert>}
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
