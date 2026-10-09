import { useRef } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { M3Button } from '../../shared/ui/m3/M3Button'
import { M3PasswordField } from '../../shared/ui/m3/M3PasswordField'
import { M3TextField } from '../../shared/ui/m3/M3TextField'
import type { SignupForm } from '../auth/useSignupForm'
import { MAX_STUDENT_AGE, MIN_STUDENT_AGE } from '../auth/validation'
import { MobileAuthLayout, MobileDivider, MobileGoogleButton, MobileRoleChip } from './MobileAuthParts'
import { useFocusFirstInvalid } from './useFocusFirstInvalid'

/** Phone sign-up screen. All logic comes from `useSignupForm`. */
export function SignupScreen({ form }: { form: SignupForm }) {
  const { role, isStudent, values, errors, requestError, authError, busy, showPassword, showConfirmation, passwordHint, invalidCount } = form
  const contentRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalid(contentRef, invalidCount)
  const error = requestError ?? authError

  return (
    <MobileAuthLayout title="Create account" backTo="/role?mode=signup">
      <div ref={contentRef} className="flex flex-1 flex-col gap-5">
        <MobileRoleChip role={role} />
        {error && <Alert tone="error" label="We couldn’t create your account">{error}</Alert>}
        {isStudent && (
          <M3TextField
            label="Age"
            name="age"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            value={values.age ?? ''}
            onChange={(event) => form.update('age', event.target.value.replace(/\D/g, ''))}
            error={errors.age}
            hint={`Required for student accounts, including Google sign-up (${MIN_STUDENT_AGE}–${MAX_STUDENT_AGE}).`}
            disabled={busy}
          />
        )}
        <MobileGoogleButton onClick={() => void form.handleGoogle()} disabled={busy} />
        <MobileDivider />
        <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={(event) => void form.handleSignup(event)}>
          <M3TextField
            label="Name"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Your name"
            value={values.name}
            onChange={(event) => form.update('name', event.target.value)}
            error={errors.name}
            disabled={busy}
          />
          <M3TextField
            label="Email address"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={values.email}
            onChange={(event) => form.update('email', event.target.value)}
            error={errors.email}
            disabled={busy}
          />
          <M3PasswordField
            label="Password"
            name="new-password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => form.update('password', event.target.value)}
            error={errors.password}
            hint={passwordHint}
            visible={showPassword}
            onToggle={form.toggleShowPassword}
            disabled={busy}
          />
          <M3PasswordField
            label="Confirm password"
            name="confirm-password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) => form.update('confirmPassword', event.target.value)}
            error={errors.confirmPassword}
            visible={showConfirmation}
            onToggle={form.toggleShowConfirmation}
            disabled={busy}
          />
          <div className="mt-auto grid gap-2 pt-4">
            <M3Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating account…' : 'Create account'}</M3Button>
            <M3Button to="/role?mode=signin" variant="text" className="w-full">Already have an account? Sign in</M3Button>
          </div>
        </form>
      </div>
    </MobileAuthLayout>
  )
}
