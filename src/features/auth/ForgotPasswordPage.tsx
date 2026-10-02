import { useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { AuthCard, AuthShell } from './AuthChrome'
import { mapFirebaseAuthError } from './authErrors'
import { sendPasswordReset } from './authService'
import { useAuth } from './useAuth'
import { validateEmail } from './validation'

export function ForgotPasswordPage() {
  const { authError, clearAuthError } = useAuth()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [requestError, setRequestError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const validationError = validateEmail(email)
    setEmailError(validationError)
    if (validationError) return

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

  return (
    <AuthShell>
      <AuthCard>
        <div className="auth-card__heading">
          <span className="auth-symbol"><MailCheck size={23} aria-hidden="true" /></span>
          <h1>Reset your password</h1>
          <p>Enter your email and we’ll send a link to get you back in.</p>
        </div>
        {(requestError || authError) && <Alert tone="error" label="We couldn’t send the reset link">{requestError ?? authError}</Alert>}
        {sent && <Alert tone="success" label="Check your email">If an account uses {email.trim()}, you’ll receive a password reset link shortly.</Alert>}
        <form className="auth-form" noValidate onSubmit={handleSubmit}>
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => { setEmail(event.target.value); setEmailError(undefined); setSent(false) }} error={emailError} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Sending link…' : 'Send reset link'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer"><Link to="/signin"><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</Link></p>
      </AuthCard>
    </AuthShell>
  )
}
