import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { ForgotPasswordScreen } from '../mobile/ForgotPasswordScreen'
import { AuthCard, AuthShell } from './AuthChrome'
import { AuthModeBadge } from './AuthModeBadge'
import { useForgotPassword } from './useForgotPassword'

export function ForgotPasswordPage() {
  const form = useForgotPassword()
  const isMobile = useIsMobileView()
  if (isMobile) return <ForgotPasswordScreen form={form} />

  const { email, emailError, requestError, authError, sent, busy } = form

  return (
    <AuthShell>
      <AuthCard>
        <div className="auth-card__heading">
          <AuthModeBadge mode="signin" detail="Password reset" />
          <span className="auth-symbol"><MailCheck size={23} aria-hidden="true" /></span>
          <h1>Reset your password</h1>
          <p>Enter your email and we’ll send a link to get you back in.</p>
        </div>
        {(requestError || authError) && <Alert tone="error" label="We couldn’t send the reset link">{requestError ?? authError}</Alert>}
        {sent && <Alert tone="success" label="Check your email">If an account uses {email.trim()}, you’ll receive a password reset link shortly.</Alert>}
        <form className="auth-form" noValidate onSubmit={form.handleSubmit}>
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => form.changeEmail(event.target.value)} error={emailError} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Sending link…' : 'Send reset link'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer"><Link to="/signin"><ArrowLeft size={14} aria-hidden="true" /> Back to sign in</Link></p>
      </AuthCard>
    </AuthShell>
  )
}
