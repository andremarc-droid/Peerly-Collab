import { ArrowRight } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { SigninScreen } from '../mobile/SigninScreen'
import { AccountTypeHint, AuthCard, AuthShell, GoogleSignInButton, PasswordField, RoleChip } from './AuthChrome'
import { AuthModeBadge } from './AuthModeBadge'
import { AccountNotRegisteredDialog } from './AccountNotRegisteredDialog'
import { readRoleIntent, type UserRole } from './roleIntent'
import { useSigninForm } from './useSigninForm'

export function SigninPage() {
  const intent = readRoleIntent()
  if (!intent || intent.mode !== 'signin') return <Navigate to="/role?mode=signin" replace />
  return <SigninForm role={intent.role} />
}

function SigninForm({ role }: { role: UserRole }) {
  const form = useSigninForm(role)
  const isMobile = useIsMobileView()
  if (isMobile) return <SigninScreen form={form} />

  const { email, password, errors, requestError, authError, busy, showPassword, notRegistered } = form

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
        <GoogleSignInButton onClick={form.handleGoogle} disabled={busy} />
        <div className="auth-divider"><span />or continue with email<span /></div>
        <form className="auth-form" noValidate onSubmit={form.handleSignin}>
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => form.changeEmail(event.target.value)} error={errors.email} disabled={busy} />
          <div className="auth-password-row"><span /><Link to="/forgot-password">Forgot password?</Link></div>
          <PasswordField label="Password" name="current-password" autoComplete="current-password" value={password} onChange={form.changePassword} error={errors.password} visible={showPassword} onToggle={form.toggleShowPassword} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer">New to Peerly Collab? <Link to="/role?mode=signup">Get started</Link></p>
      </AuthCard>
      <AccountNotRegisteredDialog open={notRegistered} onClose={form.dismissNotRegistered} onSignUp={form.handleSignUpInstead} />
    </AuthShell>
  )
}
