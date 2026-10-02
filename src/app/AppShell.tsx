import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../shared/ui/Badge'
import { Alert } from '../shared/ui/Alert'
import { Button } from '../shared/ui/Button'
import { Logo } from '../shared/ui/Logo'
import { Skeleton } from '../shared/ui/Skeleton'
import { clearReturnTo } from './returnTo'
import { clearRoleIntent } from '../features/auth/roleIntent'
import { resendVerificationEmail, signOutCurrentUser } from '../features/auth/authService'
import { useAuth } from '../features/auth/useAuth'
import { useUserProfile } from '../features/profile/useUserProfile'

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const displayName = profile?.name || user?.displayName || user?.email || 'Account'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U'

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOutCurrentUser()
      clearRoleIntent()
      clearReturnTo()
      navigate('/', { replace: true })
    } catch {
      setSignOutError('We couldn’t sign you out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Logo light={false} />
        <details className="account-menu">
          <summary aria-label="Open account menu">
            <span className="account-avatar account-avatar--initial" aria-hidden="true">{initial}</span>
            <span className="account-menu__identity"><strong>{displayName}</strong>{profile?.role && <Badge>{profile.role === 'instructor' ? 'Instructor' : 'Student'}</Badge>}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="account-menu__panel">
            <Link to="/profile"><UserRound size={16} aria-hidden="true" /> Profile</Link>
            <Button type="button" variant="ghost" onClick={handleSignOut} disabled={signingOut}><LogOut size={16} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}</Button>
          </div>
        </details>
      </header>
      {user && !user.emailVerified && <EmailVerificationNotice />}
      {signOutError && <div className="app-shell__error"><Alert tone="error" label="Sign out failed">{signOutError}</Alert></div>}
      <div className="app-shell__content">{children}</div>
    </div>
  )
}

export function AppShellLoading() {
  return (
    <div className="app-shell" aria-busy="true">
      <header className="app-shell__header"><Skeleton className="app-shell__logo-skeleton" label="Loading Cool-lab" /><Skeleton className="app-shell__account-skeleton" label="Loading account" /></header>
      <main className="app-shell__content app-shell__loading"><Skeleton className="app-shell__title-skeleton" /><Skeleton className="app-shell__card-skeleton" label="Loading dashboard" /></main>
    </div>
  )
}

function EmailVerificationNotice() {
  const { user } = useAuth()
  const [cooldown, setCooldown] = useState(user && !user.emailVerified ? 60 : 0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setTimeout(() => setCooldown((remaining) => Math.max(0, remaining - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  if (!user || user.emailVerified) return null

  async function resend() {
    if (!user || cooldown > 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      await resendVerificationEmail(user)
      setNotice('A new verification email is on its way.')
      setCooldown(60)
    } catch {
      setNotice('We couldn’t send the email right now. Try again shortly.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell__notice" role="status">
      <span>Verify your email to finish setting up your account.</span>
      {notice && <span>{notice}</span>}
      <Button type="button" variant="ghost" onClick={resend} disabled={busy || cooldown > 0}>{busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}</Button>
    </div>
  )
}
