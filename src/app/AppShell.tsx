import { useEffect, useState, type ReactNode } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Badge } from '../shared/ui/Badge'
import { Alert } from '../shared/ui/Alert'
import { Button } from '../shared/ui/Button'
import { DropdownMenu } from '../shared/ui/DropdownMenu'
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
  const roleLabel = profile?.role === 'instructor' ? 'Instructor' : profile?.role === 'student' ? 'Student' : null

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
        <Logo />
        <DropdownMenu label="Account menu" className="account-menu order-2 sm:order-3" trigger={<><span className="account-avatar" aria-hidden="true">{profile?.photoURL ? <img src={profile.photoURL} alt="" /> : initial}</span><span className="account-menu__identity"><strong>{displayName}</strong>{roleLabel && <Badge>{roleLabel}</Badge>}</span></>}>
          <div className="account-menu__details"><strong>{displayName}</strong><span>{profile?.email || user?.email}</span>{roleLabel && <Badge>{roleLabel}</Badge>}</div>
          <Link to="/profile" role="menuitem"><UserRound size={17} aria-hidden="true" /> Profile</Link>
          <Button type="button" role="menuitem" variant="ghost" onClick={handleSignOut} disabled={signingOut}><LogOut size={17} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}</Button>
        </DropdownMenu>
        {roleLabel === 'Instructor' && <nav aria-label="Instructor navigation" className="order-3 flex basis-full items-center gap-2 sm:order-2 sm:basis-auto"><NavLink to="/instructor" end className={({ isActive }) => `min-h-11 rounded-full px-3 py-2 text-sm font-semibold no-underline transition-colors sm:px-4 ${isActive ? 'bg-white text-navy-900' : 'text-white hover:bg-white-12'}`}>Classes</NavLink><NavLink to="/instructor/quizzes" className={({ isActive }) => `min-h-11 rounded-full px-3 py-2 text-sm font-semibold no-underline transition-colors sm:px-4 ${isActive ? 'bg-white text-navy-900' : 'text-white hover:bg-white-12'}`}>Quizzes</NavLink></nav>}
      </header>
      {user && !user.emailVerified && <EmailVerificationNotice />}
      {signOutError && <div className="app-shell__error"><Alert tone="error" label="Sign out failed">{signOutError}</Alert></div>}
      <div className="app-shell__page">{children}</div>
    </div>
  )
}

export function AppShellLoading() {
  return (
    <div className="app-shell" aria-busy="true">
      <header className="app-shell__header"><Skeleton className="app-shell__logo-skeleton" label="Loading Peerly Collab" /><Skeleton className="app-shell__account-skeleton" label="Loading account" /></header>
      <div className="app-shell__page"><main className="app-shell__content app-shell__loading"><Skeleton className="app-shell__title-skeleton" /><Skeleton className="app-shell__card-skeleton" label="Loading dashboard" /></main></div>
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

  return <div className="app-shell__notice"><Alert tone="warning" label="Verify your email" action={<Button type="button" variant="ghost" onClick={resend} disabled={busy || cooldown > 0}>{busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}</Button>}>{notice ?? 'Confirm your email address to finish setting up your account.'}</Alert></div>
}
