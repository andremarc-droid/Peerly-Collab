import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, LogOut, MailCheck, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { Card } from '../../shared/ui/Card'
import { Logo } from '../../shared/ui/Logo'
import { Spinner } from '../../shared/ui/Spinner'
import { StripeBackground } from '../../shared/ui/StripeBackground'
import { useAuth } from './useAuth'
import { mapFirebaseAuthError } from './authErrors'
import { resendVerificationEmail, signOutCurrentUser } from './authService'

interface WelcomeRouteState {
  verificationSent?: boolean
  verificationError?: string | null
}

export function WelcomePage() {
  const { user, status, authError } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const routeState = location.state as WelcomeRouteState | null
  const [cooldown, setCooldown] = useState(routeState?.verificationSent || (user && !user.emailVerified) ? 60 : 0)
  const [resendBusy, setResendBusy] = useState(false)
  const resendLock = useRef(false)
  const [signoutBusy, setSignoutBusy] = useState(false)
  const signoutLock = useRef(false)
  const [verificationError, setVerificationError] = useState(routeState?.verificationError ?? null)
  const [verificationSent, setVerificationSent] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  if (status === 'loading') return <main className="auth-wait"><Spinner label="Loading your account" /></main>
  if (status === 'signedOut' || !user) return <Navigate to="/role?mode=signin" replace />

  async function handleResend() {
    if (!user || cooldown > 0 || resendLock.current) return
    resendLock.current = true
    setResendBusy(true)
    setPageError(null)
    setVerificationError(null)
    setVerificationSent(false)
    try {
      await resendVerificationEmail(user)
      setVerificationSent(true)
      setCooldown(60)
    } catch (error) {
      setVerificationError(mapFirebaseAuthError(error))
    } finally {
      resendLock.current = false
      setResendBusy(false)
    }
  }

  async function handleSignout() {
    if (signoutLock.current) return
    signoutLock.current = true
    setSignoutBusy(true)
    setPageError(null)
    try {
      await signOutCurrentUser()
      navigate('/role?mode=signin', { replace: true })
    } catch (error) {
      setPageError(mapFirebaseAuthError(error))
    } finally {
      signoutLock.current = false
      setSignoutBusy(false)
    }
  }

  return (
    <main className="auth-screen welcome-screen" id="main-content">
      <StripeBackground variant="fade" />
      <header className="auth-screen__header"><Logo /><Link to="/" className="auth-home-link">Home</Link></header>
      <div className="auth-screen__content">
        <Card elevated className="welcome-card">
          <span className="welcome-mark"><Check size={22} aria-hidden="true" /></span>
          <Badge>YOU’RE IN</Badge>
          <h1>Welcome to Cool-lab.</h1>
          <p className="welcome-email">Signed in as <strong>{user.email ?? user.displayName ?? 'your account'}</strong></p>
          {authError && <Alert tone="error" label="Session notice">{authError}</Alert>}
          {pageError && <Alert tone="error" label="Action not completed">{pageError}</Alert>}
          {!user.emailVerified && <Alert tone="warning" label="Verify your email" action={<Button type="button" variant="ghost" className="verification-resend" onClick={handleResend} disabled={resendBusy || cooldown > 0}>{resendBusy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'} <ArrowRight size={14} aria-hidden="true" /></Button>}>We sent a verification link to {user.email ?? 'your email'}. Check your inbox to finish setting up your account.</Alert>}
          {verificationError && <Alert tone="error" label="Verification email not sent">{verificationError}</Alert>}
          {verificationSent && <Alert tone="success" label="Email sent">A new verification link is on its way.</Alert>}
          <div className="welcome-details"><span><ShieldCheck size={17} aria-hidden="true" /> Your session is saved on this device.</span><span><MailCheck size={17} aria-hidden="true" /> You can continue while you verify your email.</span></div>
          <Button type="button" variant="secondary" className="signout-button" onClick={handleSignout} disabled={signoutBusy}><LogOut size={17} aria-hidden="true" /> {signoutBusy ? 'Signing out…' : 'Sign out'}</Button>
        </Card>
      </div>
      <p className="auth-screen__footer">COOL-LAB · LEARN IT. OWN IT. TOGETHER.</p>
    </main>
  )
}
