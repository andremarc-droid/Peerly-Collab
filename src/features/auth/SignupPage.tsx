import { ArrowRight } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { SignupScreen } from '../mobile/SignupScreen'
import { AccountTypeHint, AuthCard, AuthShell, GoogleSignInButton, PasswordField, RoleChip } from './AuthChrome'
import { AuthModeBadge } from './AuthModeBadge'
import { readRoleIntent, type RoleIntent } from './roleIntent'
import { useSignupForm } from './useSignupForm'
import { MAX_STUDENT_AGE, MIN_STUDENT_AGE } from './validation'

export function SignupPage() {
  const intent = readRoleIntent()
  if (!intent || intent.mode !== 'signup') return <Navigate to="/role?mode=signup" replace />
  return <SignupForm intent={intent} />
}

function SignupForm({ intent }: { intent: RoleIntent }) {
  const form = useSignupForm(intent)
  const isMobile = useIsMobileView()
  if (isMobile) return <SignupScreen form={form} />

  const { role, isStudent, values, errors, requestError, authError, busy, showPassword, showConfirmation, passwordHint } = form

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
            onChange={(event) => form.update('age', event.target.value.replace(/\D/g, ''))}
            error={errors.age}
            hint={`Required for student accounts, including Google sign-up (${MIN_STUDENT_AGE}–${MAX_STUDENT_AGE}).`}
            disabled={busy}
          />
        )}
        <GoogleSignInButton onClick={form.handleGoogle} disabled={busy} />
        <div className="auth-divider"><span />or continue with email<span /></div>
        <form className="auth-form" noValidate onSubmit={form.handleSignup}>
          <Input label="Name" name="name" autoComplete="name" placeholder="Your name" value={values.name} onChange={(event) => form.update('name', event.target.value)} error={errors.name} disabled={busy} />
          <Input label="Email address" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={(event) => form.update('email', event.target.value)} error={errors.email} disabled={busy} />
          <PasswordField label="Password" name="new-password" autoComplete="new-password" value={values.password} onChange={(value) => form.update('password', value)} error={errors.password} hint={passwordHint} visible={showPassword} onToggle={form.toggleShowPassword} disabled={busy} />
          <PasswordField label="Confirm password" name="confirm-password" autoComplete="new-password" value={values.confirmPassword} onChange={(value) => form.update('confirmPassword', value)} error={errors.confirmPassword} visible={showConfirmation} onToggle={form.toggleShowConfirmation} disabled={busy} />
          <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'} <ArrowRight size={17} aria-hidden="true" /></Button>
        </form>
        <p className="auth-card__footer">Already have an account? <Link to="/role?mode=signin">Sign in</Link></p>
      </AuthCard>
    </AuthShell>
  )
}
