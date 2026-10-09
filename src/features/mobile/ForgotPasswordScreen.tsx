import { useRef } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { M3Button } from '../../shared/ui/m3/M3Button'
import { M3TextField } from '../../shared/ui/m3/M3TextField'
import type { ForgotPasswordForm } from '../auth/useForgotPassword'
import { MobileAuthLayout } from './MobileAuthParts'
import { useFocusFirstInvalid } from './useFocusFirstInvalid'

/** Phone password-reset screen. All logic comes from `useForgotPassword`. */
export function ForgotPasswordScreen({ form }: { form: ForgotPasswordForm }) {
  const { email, emailError, requestError, authError, sent, busy, invalidCount } = form
  const contentRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalid(contentRef, invalidCount)
  const error = requestError ?? authError

  return (
    <MobileAuthLayout title="Reset password" backTo="/signin">
      <div ref={contentRef} className="flex flex-1 flex-col gap-5">
        <p className="m-0 text-base leading-6 text-navy-900">Enter your email and we’ll send a link to get you back in.</p>
        {error && <Alert tone="error" label="We couldn’t send the reset link">{error}</Alert>}
        {sent && <Alert tone="success" label="Check your email">If an account uses {email.trim()}, you’ll receive a password reset link shortly.</Alert>}
        <form className="flex flex-1 flex-col gap-4" noValidate onSubmit={(event) => void form.handleSubmit(event)}>
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
            error={emailError}
            disabled={busy}
          />
          <div className="mt-auto pt-4">
            <M3Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending link…' : 'Send reset link'}</M3Button>
          </div>
        </form>
      </div>
    </MobileAuthLayout>
  )
}
