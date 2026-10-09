import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { BookOpen, LayoutGrid, LogOut, Sparkles, UserRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Logo } from '../../shared/ui/Logo'
import { Skeleton } from '../../shared/ui/Skeleton'
import { M3NavBar, type M3NavItem } from '../../shared/ui/m3/M3NavBar'
import { clearReturnTo } from '../../app/returnTo'
import { clearRoleIntent } from '../auth/roleIntent'
import { signOutCurrentUser } from '../auth/authService'
import { useAuth } from '../auth/useAuth'
import { useUserProfile } from '../profile/useUserProfile'
import { isMobileTabRoot, mobileBackTo, type MobileRole } from '../../lib/platform/mobileChrome'
import { MobileChromeContext } from '../../lib/platform/mobileChromeContext'

const INSTRUCTOR_NAV: M3NavItem[] = [
  { to: '/instructor', label: 'Classes', Icon: LayoutGrid, end: true },
  { to: '/instructor/quizzes', label: 'Quizzes', Icon: BookOpen },
  { to: '/instructor/learning', label: 'Learning', Icon: Sparkles },
  { to: '/profile', label: 'Profile', Icon: UserRound },
]

const STUDENT_NAV: M3NavItem[] = [
  { to: '/student', label: 'Classes', Icon: LayoutGrid, end: true },
  { to: '/student/learning', label: 'Learning', Icon: Sparkles },
  { to: '/profile', label: 'Profile', Icon: UserRound },
]

export function MobileAppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const displayName = profile?.name || user?.displayName || user?.email || 'Account'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U'
  const role: MobileRole | null = profile?.role === 'instructor' || profile?.role === 'student' ? profile.role : null
  const tabRoot = isMobileTabRoot(pathname)
  const navItems = role === 'instructor' ? INSTRUCTOR_NAV : role === 'student' ? STUDENT_NAV : []
  const chrome = { tabRoot, backTo: tabRoot ? null : mobileBackTo(pathname, role) }

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
    <MobileChromeContext.Provider value={chrome}>
      <div className={`app-shell app-shell--m3 ${tabRoot ? 'app-shell--tab' : 'app-shell--stack'} flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)]`}>
        {tabRoot && (
          <header className="m3-logo-row flex h-16 shrink-0 items-center justify-between px-4">
            <Logo light={false} />
            <AccountButton
              displayName={displayName}
              email={profile?.email || user?.email}
              photoURL={profile?.photoURL}
              initial={initial}
              roleLabel={role === 'instructor' ? 'Instructor' : role === 'student' ? 'Student' : null}
              signingOut={signingOut}
              onSignOut={() => void handleSignOut()}
            />
          </header>
        )}
        {signOutError && (
          <div className="app-shell__error px-6">
            <Alert tone="error" label="Sign out failed">{signOutError}</Alert>
          </div>
        )}
        <div className="app-shell__page m3-enter min-w-0 flex-1">{children}</div>
        {tabRoot && navItems.length > 0 && <M3NavBar items={navItems} label={`${role === 'instructor' ? 'Instructor' : 'Student'} navigation`} />}
      </div>
    </MobileChromeContext.Provider>
  )
}

function AccountButton({
  displayName,
  email,
  photoURL,
  initial,
  roleLabel,
  signingOut,
  onSignOut,
}: {
  displayName: string
  email: string | null | undefined
  photoURL: string | null | undefined
  initial: string
  roleLabel: 'Instructor' | 'Student' | null
  signingOut: boolean
  onSignOut: () => void
}) {
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

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="m3-press m3-press--icon inline-grid size-12 cursor-pointer place-items-center rounded-full border border-navy-900-30 bg-white text-navy-900"
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {photoURL ? <img src={photoURL} alt="" className="size-10 rounded-full object-cover" /> : <span aria-hidden="true" className="font-heading text-base font-bold">{initial}</span>}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-40 mt-2 w-72 rounded-3xl border border-navy-900-30 bg-white p-3 text-navy-900 shadow-lg"
        >
          <div className="grid gap-1 px-3 py-2">
            <strong className="truncate text-base">{displayName}</strong>
            {email && <span className="truncate text-sm text-navy-800-72">{email}</span>}
            {roleLabel && <span className="text-sm font-semibold">{roleLabel}</span>}
          </div>
          <Link
            to="/profile"
            className="m3-press mt-1 flex min-h-12 items-center gap-2 rounded-2xl px-3 text-base font-semibold text-navy-900 no-underline"
            onClick={() => setOpen(false)}
          >
            <UserRound size={20} aria-hidden="true" /> Profile
          </Link>
          <button
            type="button"
            className="m3-press flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-2xl border-0 bg-transparent px-3 text-left text-base font-semibold text-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut size={20} aria-hidden="true" /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}

export function MobileAppShellLoading() {
  return (
    <div className="app-shell app-shell--m3 flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)]" aria-busy="true">
      <header className="flex h-16 items-center justify-between px-4">
        <Skeleton className="h-8 w-36" label="Loading Peerly Collab" />
        <Skeleton className="size-12 rounded-full" label="Loading account" />
      </header>
      <div className="flex-1 px-6 pt-4">
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="h-56 w-full rounded-3xl" label="Loading dashboard" />
      </div>
    </div>
  )
}
