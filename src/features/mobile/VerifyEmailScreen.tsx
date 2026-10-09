import { Alert } from '../../shared/ui/Alert'
import { M3Button } from '../../shared/ui/m3/M3Button'
import type { EmailVerification } from '../auth/useEmailVerification'
import { verificationLabel } from '../auth/useEmailVerification'
import { MobileAuthLayout } from './MobileAuthParts'

/** Phone email-verification screen. It has no Back button: the account is signed in and this is the only way forward. */
export function VerifyEmailScreen({ verification }: { verification: EmailVerification }) {
  const { user, cooldown, busyAction, message, resend, checkVerification } = verification

  return (
    <MobileAuthLayout title="Verify your email">
      <div className="flex flex-1 flex-col gap-5">
        <p className="m-0 text-base leading-6 text-navy-900">
          Confirm {user?.email ? <strong className="break-all">{user.email}</strong> : 'your email address'} to finish setting up your account.
        </p>
        {message && <Alert tone={message.tone} label={verificationLabel(message.tone)}>{message.text}</Alert>}
        <div className="mt-auto grid gap-3 pt-4">
          <M3Button variant="outlined" onClick={() => void resend()} disabled={!user || busyAction !== null || cooldown > 0} className="w-full">
            {busyAction === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
          </M3Button>
          <M3Button onClick={() => void checkVerification()} disabled={busyAction !== null} className="w-full">
            {busyAction === 'check' ? 'Checking…' : 'Check verification'}
          </M3Button>
        </div>
      </div>
    </MobileAuthLayout>
  )
}
