import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardPath } from '../../app/returnTo'
import { mapFirebaseAuthError } from './authErrors'
import { resendVerificationEmail } from './authService'
import type { UserRole } from './roleIntent'
import { useAuth } from './useAuth'

export type VerificationTone = 'success' | 'info' | 'error'

export function verificationLabel(tone: VerificationTone): string {
  return tone === 'error' ? 'Email verification failed' : tone === 'success' ? 'Email sent' : 'Not verified yet'
}

/** Resend and check actions for the verification screen, shared by the desktop page and the phone screen. */
export function useEmailVerification(role: UserRole) {
  const { user, refreshEmailVerification } = useAuth()
  const navigate = useNavigate()
  const [cooldown, setCooldown] = useState(0)
  const [busyAction, setBusyAction] = useState<'resend' | 'check' | null>(null)
  const [message, setMessage] = useState<{ tone: VerificationTone; text: string } | null>(null)

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

  return { user, cooldown, busyAction, message, resend, checkVerification }
}

export type EmailVerification = ReturnType<typeof useEmailVerification>
