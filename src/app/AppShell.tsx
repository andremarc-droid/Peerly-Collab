import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { LogOut, Menu, UserRound, X } from 'lucide-react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Badge } from '../shared/ui/Badge'
import { Alert } from '../shared/ui/Alert'
import { Button } from '../shared/ui/Button'
import { DropdownMenu } from '../shared/ui/DropdownMenu'
import { Logo } from '../shared/ui/Logo'
import { Skeleton } from '../shared/ui/Skeleton'
import { clearReturnTo } from './returnTo'
import { clearRoleIntent } from '../features/auth/roleIntent'
import { signOutCurrentUser } from '../features/auth/authService'
import { useAuth } from '../features/auth/useAuth'
import { useUserProfile } from '../features/profile/useUserProfile'
import { useIsMobileView } from '../lib/platform/isMobileView'
import { MobileAppShell, MobileAppShellLoading } from '../features/mobile/MobileAppShell'

interface NavItem { to: string; label: string; end?: boolean }

const NAV_ITEMS: Record<'Instructor' | 'Student', NavItem[]> = {
  Instructor: [
    { to: '/instructor', label: 'Classes', end: true },
    { to: '/instructor/quizzes', label: 'Activities & Quizzes' },
    { to: '/instructor/learning', label: 'Learning' },
  ],
  Student: [
    { to: '/student', label: 'Classes', end: true },
    { to: '/student/learning', label: 'Learning' },
  ],
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-semibold no-underline transition-colors sm:px-4 ${isActive ? 'bg-white text-navy-900' : 'text-white hover:bg-white-12'}`
}

const mobileItemClass = 'inline-flex min-h-11 w-full items-center gap-2 rounded-full border-0 bg-transparent px-3 py-2 text-left text-sm font-semibold text-white no-underline transition-colors hover:bg-white-12'

function mobileLinkClass({ isActive }: { isActive: boolean }) {
  return `inline-flex min-h-11 w-full items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold no-underline transition-colors ${isActive ? 'bg-white text-navy-900' : 'text-white hover:bg-white-12'}`
}

interface MobileMenuProps {
  roleLabel: 'Instructor' | 'Student' | null
  displayName: string
  email: string | null | undefined
  photoURL: string | null | undefined
  initial: string
  signingOut: boolean
  onSignOut: () => void
}

/** Phone-sized header: one hamburger button holds the navigation, the account details and sign out. */
function MobileMenu({ roleLabel, displayName, email, photoURL, initial, signingOut, onSignOut }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={rootRef} className="mobile-menu order-2 md:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-grid size-11 cursor-pointer place-items-center rounded-full border border-white-25 bg-transparent text-white transition-colors hover:bg-white-12"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} className="mobile-menu__panel">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="account-avatar" aria-hidden="true">{photoURL ? <img src={photoURL} alt="" /> : initial}</span>
            <div className="grid min-w-0 justify-items-start gap-1 text-white">
              <strong className="max-w-full truncate text-sm">{displayName}</strong>
              {email && <span className="max-w-full truncate text-xs text-white-72">{email}</span>}
              {roleLabel && <Badge>{roleLabel}</Badge>}
            </div>
          </div>
          <hr className="my-1 border-0 border-t border-white-12" />
          {roleLabel && (
            <nav aria-label={`${roleLabel} navigation`} className="grid gap-1">
              {NAV_ITEMS[roleLabel].map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={mobileLinkClass} onClick={close}>{item.label}</NavLink>
              ))}
            </nav>
          )}
          {roleLabel && <hr className="my-1 border-0 border-t border-white-12" />}
          <NavLink to="/profile" className={mobileLinkClass} onClick={close}><UserRound size={17} aria-hidden="true" /> Profile</NavLink>
          <button type="button" className={`${mobileItemClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`} onClick={onSignOut} disabled={signingOut}><LogOut size={17} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      )}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  if (useIsMobileView()) return <MobileAppShell>{children}</MobileAppShell>
  return <DesktopAppShell>{children}</DesktopAppShell>
}

function DesktopAppShell({ children }: { children: ReactNode }) {
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
        <DropdownMenu label="Account menu" className="account-menu order-2 hidden md:order-3 md:block" trigger={<><span className="account-avatar" aria-hidden="true">{profile?.photoURL ? <img src={profile.photoURL} alt="" /> : initial}</span><span className="account-menu__identity"><strong>{displayName}</strong>{roleLabel && <Badge>{roleLabel}</Badge>}</span></>}>
          <div className="account-menu__details"><strong>{displayName}</strong><span>{profile?.email || user?.email}</span>{roleLabel && <Badge>{roleLabel}</Badge>}</div>
          <Link to="/profile" role="menuitem"><UserRound size={17} aria-hidden="true" /> Profile</Link>
          <Button type="button" role="menuitem" variant="ghost" onClick={handleSignOut} disabled={signingOut}><LogOut size={17} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}</Button>
        </DropdownMenu>
        <MobileMenu roleLabel={roleLabel} displayName={displayName} email={profile?.email || user?.email} photoURL={profile?.photoURL} initial={initial} signingOut={signingOut} onSignOut={handleSignOut} />
        {roleLabel && (
          <nav aria-label={`${roleLabel} navigation`} className="hidden flex-wrap items-center gap-2 md:order-2 md:flex md:basis-auto">
            {NAV_ITEMS[roleLabel].map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>{item.label}</NavLink>
            ))}
          </nav>
        )}
      </header>
      {signOutError && <div className="app-shell__error"><Alert tone="error" label="Sign out failed">{signOutError}</Alert></div>}
      <div className="app-shell__page">{children}</div>
    </div>
  )
}

export function AppShellLoading() {
  if (useIsMobileView()) return <MobileAppShellLoading />
  return (
    <div className="app-shell" aria-busy="true">
      <header className="app-shell__header"><Skeleton className="app-shell__logo-skeleton" label="Loading Peerly Collab" /><Skeleton className="app-shell__account-skeleton" label="Loading account" /></header>
      <div className="app-shell__page"><main className="app-shell__content app-shell__loading"><Skeleton className="app-shell__title-skeleton" /><Skeleton className="app-shell__card-skeleton" label="Loading dashboard" /></main></div>
    </div>
  )
}
