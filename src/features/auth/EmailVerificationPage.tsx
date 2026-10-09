import { MailCheck, RefreshCw } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { VerifyEmailScreen } from '../mobile/VerifyEmailScreen'
import { AuthCard, AuthShell } from './AuthChrome'
import type { UserRole } from './roleIntent'
import { useEmailVerification, verificationLabel } from './useEmailVerification'

interface EmailVerificationPageProps {
  role: UserRole
}

export function EmailVerificationPage({ role }: EmailVerificationPageProps) {
  const verification = useEmailVerification(role)
  const isMobile = useIsMobileView()
  if (isMobile) return <VerifyEmailScreen verification={verification} />

  const { user, cooldown, busyAction, message, resend, checkVerification } = verification

  return (
    <AuthShell>
      <AuthCard className="grid gap-5">
        <div className="grid justify-items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-navy-900-08 text-navy-900" aria-hidden="true">
            <MailCheck size={26} />
          </span>
          <div className="grid gap-2">
            <h1 className="m-0 font-heading text-2xl font-bold text-navy-900">Verify your email</h1>
            <p className="m-0 text-base text-navy-800">
              Confirm {user?.email ? <strong>{user.email}</strong> : 'your email address'} to finish setting up your account.
            </p>
          </div>
        </div>
        {message && <Alert tone={message.tone} label={verificationLabel(message.tone)}>{message.text}</Alert>}
        <div className="grid gap-3">
          <Button type="button" variant="secondary" onClick={() => void resend()} disabled={!user || busyAction !== null || cooldown > 0}>
            {busyAction === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
          </Button>
          <Button type="button" onClick={() => void checkVerification()} disabled={busyAction !== null}>
            <RefreshCw size={17} aria-hidden="true" /> {busyAction === 'check' ? 'Checking…' : 'I already verified via email'}
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
