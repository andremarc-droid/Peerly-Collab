import { useEffect, useState } from 'react'
import { MailCheck, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { dashboardPath } from '../../app/returnTo'
import { mapFirebaseAuthError } from './authErrors'
import { resendVerificationEmail } from './authService'
import { AuthCard, AuthShell } from './AuthChrome'
import { useAuth } from './useAuth'
import type { UserRole } from './roleIntent'

interface EmailVerificationPageProps {
  role: UserRole
}

export function EmailVerificationPage({ role }: EmailVerificationPageProps) {
  const { user, refreshEmailVerification } = useAuth()
  const navigate = useNavigate()
  const [cooldown, setCooldown] = useState(0)
  const [busyAction, setBusyAction] = useState<'resend' | 'check' | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function resend() {
    if (!user || cooldown > 0 || busyAction) return
    setBusyAction('resend')
    setMessage(null)
    try {
      await resendVerificationEmail(user)
      setMessage({ tone: 'success', text: 'A new verification email is on its way.' })
      setCooldown(60)
    } catch (error) {
      setMessage({ tone: 'error', text: mapFirebaseAuthError(error) })
    } finally {
      setBusyAction(null)
    }
  }

  async function checkVerification() {
    if (busyAction) return
    setBusyAction('check')
    setMessage(null)
    try {
      if (await refreshEmailVerification()) {
        navigate(dashboardPath(role), { replace: true })
      } else {
        setMessage({ tone: 'info', text: 'Your email is not verified yet. Check your inbox, then try again.' })
      }
    } catch (error) {
      setMessage({ tone: 'error', text: mapFirebaseAuthError(error) })
    } finally {
      setBusyAction(null)
    }
  }

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
        {message && <Alert tone={message.tone} label={message.tone === 'error' ? 'Email verification failed' : message.tone === 'success' ? 'Email sent' : 'Not verified yet'}>{message.text}</Alert>}
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
