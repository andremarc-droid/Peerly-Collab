import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { AccountTypeHint, AuthCard, AuthShell, GoogleSignInButton, PasswordField, RoleChip } from './AuthChrome'
import { AuthModeBadge } from './AuthModeBadge'
import { AccountNotRegisteredDialog } from './AccountNotRegisteredDialog'
import { mapFirebaseAuthError, isAccountNotRegisteredError } from './authErrors'
import { signInWithEmail, signInWithGoogle } from './authService'
import { useAuth } from './useAuth'
import { validateSignin, type AuthFieldErrors } from './validation'
import { readRoleIntent, saveRoleIntent, type UserRole } from './roleIntent'
import { clearAccountNotRegisteredMark, hasAccountNotRegisteredMark } from './notRegisteredMark'

export function SigninPage() {
  const intent = readRoleIntent()
  if (!intent || intent.mode !== 'signin') return <Navigate to="/role?mode=signin" replace />
  return <SigninForm role={intent.role} />
}

function SigninForm({ role }: { role: UserRole }) {
  const { authError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<AuthFieldErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const [notRegistered, setNotRegistered] = useState(() => hasAccountNotRegisteredMark())

  useEffect(() => { clearAccountNotRegisteredMark() }, [])

  function handleSignUpInstead() {
    saveRoleIntent({ role, mode: 'signup' })
    navigate('/signup?mode=signup')
  }

  async function handleSignin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const validationErrors = validateSignin(email, password)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

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

  return (
    <AuthShell>
      <AuthCard>
        <div className="auth-card__heading">
          <AuthModeBadge mode="signin" step={2} totalSteps={2} />
          <RoleChip role={role} mode="signin" />
          <AccountTypeHint role={role} />
          <h1>Welcome back.</h1>
          <p>Pick up where your curiosity left off.</p>
        </div>
        {(requestError || authError) && <Alert tone="error" label="We couldn’t sign you in">{requestError ?? authError}</Alert>}
        <GoogleSignInButton onClick={handleGoogle} disabled={busy} />
        <div className="auth-divider"><span />or continue with email<span /></div>
        <form className="auth-form" noValidate onSubmit={handleSignin}>
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })) }} error={errors.email} disabled={busy} />
          <div className="auth-password-row"><span /><Link to="/forgot-password">Forgot password?</Link></div>
          <PasswordField label="Password" name="current-password" autoComplete="current-password" value={password} onChange={(value) => { setPassword(value); setErrors((previous) => ({ ...previous, password: undefined })) }} error={errors.password} visible={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer">New to Peerly Collab? <Link to="/role?mode=signup">Get started</Link></p>
      </AuthCard>
      <AccountNotRegisteredDialog open={notRegistered} onClose={() => setNotRegistered(false)} onSignUp={handleSignUpInstead} />
    </AuthShell>
  )
}
