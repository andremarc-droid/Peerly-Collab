import { useRef } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { M3Button } from '../../shared/ui/m3/M3Button'
import { M3PasswordField } from '../../shared/ui/m3/M3PasswordField'
import { M3TextField } from '../../shared/ui/m3/M3TextField'
import { AccountNotRegisteredDialog } from '../auth/AccountNotRegisteredDialog'
import type { SigninForm } from '../auth/useSigninForm'
import { MobileAuthLayout, MobileDivider, MobileGoogleButton, MobileRoleChip } from './MobileAuthParts'
import { useFocusFirstInvalid } from './useFocusFirstInvalid'

/** Phone sign-in screen. All logic comes from `useSigninForm`. */
export function SigninScreen({ form }: { form: SigninForm }) {
  const { role, email, password, errors, requestError, authError, busy, showPassword, invalidCount } = form
  const contentRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalid(contentRef, invalidCount)
  const error = requestError ?? authError

  return (
    <MobileAuthLayout title="Sign in" backTo="/role?mode=signin">
      <div ref={contentRef} className="flex flex-1 flex-col gap-5">
        <MobileRoleChip role={role} />
        {error && <Alert tone="error" label="We couldn’t sign you in">{error}</Alert>}
        <MobileGoogleButton onClick={() => void form.handleGoogle()} disabled={busy} />
        <MobileDivider />
        <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={(event) => void form.handleSignin(event)}>
          <M3TextField
            label="Email address"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={email}
            onChange={(event) => form.changeEmail(event.target.value)}
            error={errors.email}
            disabled={busy}
          />
          <M3PasswordField
            label="Password"
            name="current-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => form.changePassword(event.target.value)}
            error={errors.password}
            visible={showPassword}
            onToggle={form.toggleShowPassword}
            disabled={busy}
          />
          <M3Button to="/forgot-password" variant="text" className="self-end">Forgot password?</M3Button>
          <div className="mt-auto grid gap-2 pt-4">
            <M3Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</M3Button>
            <M3Button to="/role?mode=signup" variant="text" className="w-full">New here? Create account</M3Button>
          </div>
        </form>
      </div>
      <AccountNotRegisteredDialog open={form.notRegistered} onClose={form.dismissNotRegistered} onSignUp={form.handleSignUpInstead} />
    </MobileAuthLayout>
  )
}
