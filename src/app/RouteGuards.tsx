import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Alert } from '../shared/ui/Alert'
import { Button } from '../shared/ui/Button'
import { useAuth } from '../features/auth/useAuth'
import { useUserProfile } from '../features/profile/useUserProfile'
import type { UserRole } from '../features/auth/roleIntent'
import { dashboardPath, locationPath, readReturnTo, clearReturnTo } from './returnTo'
import { AppShellLoading } from './AppShell'
import { signedOutRedirectPath } from '../features/profile/accountDeletionState'

export function PublicRoute({ children }: { children: ReactNode }) {
  const { status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const location = useLocation()

  if (status === 'loading' || (status === 'signedIn' && (profileStatus === 'loading' || loading))) return <AppShellLoading />
  if (status !== 'signedIn') return children
  if (profileStatus === 'error') return <ProfileRouteError message={profileError ?? 'We couldn’t load your profile.'} onRetry={retryProfileSetup} />
  if (error) return <ProfileRouteError message={error} onRetry={retryProfileSetup} />
  if (!profile?.role) {
    if (location.pathname === '/role' && new URLSearchParams(location.search).get('mode') === 'continue') return children
    return <Navigate to="/role?mode=continue" replace state={{ from: locationPath(location) }} />
  }
  return <SignedInRedirect role={profile.role} />
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const location = useLocation()

  if (status === 'loading' || (status === 'signedIn' && (profileStatus === 'loading' || loading))) return <AppShellLoading />
  if (status === 'signedOut') return <Navigate to={signedOutRedirectPath()} replace state={{ from: locationPath(location) }} />
  if (profileStatus === 'error' || error) return <ProfileRouteError message={profileError ?? error ?? 'We couldn’t load your profile.'} onRetry={retryProfileSetup} />
  if (!profile?.role) return <Navigate to="/role?mode=continue" replace state={{ from: locationPath(location) }} />
  return children
}

export function RoleRoute({ allowedRoles, children }: { allowedRoles: UserRole[]; children: ReactNode }) {
  const { user, status, profileStatus, profileError, retryProfileSetup } = useAuth()
  const { profile, loading, error } = useUserProfile()
  const location = useLocation()

  if (status === 'loading' || (status === 'signedIn' && (profileStatus === 'loading' || loading))) return <AppShellLoading />
  if (status === 'signedOut') return <Navigate to={signedOutRedirectPath()} replace state={{ from: locationPath(location) }} />
  if (!user) return <Navigate to={signedOutRedirectPath()} replace state={{ from: locationPath(location) }} />
  if (profileStatus === 'error' || error) return <ProfileRouteError message={profileError ?? error ?? 'We couldn’t load your profile.'} onRetry={retryProfileSetup} />
  if (!profile?.role) return <Navigate to="/role?mode=continue" replace state={{ from: locationPath(location) }} />
  if (!allowedRoles.includes(profile.role)) return <Navigate to={dashboardPath(profile.role)} replace />
  return children
}

function ProfileRouteError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <main className="route-state"><Alert tone="error" label="Account details unavailable">{message}</Alert>{onRetry && <Button type="button" onClick={onRetry}>Try again</Button>}</main>
}

function SignedInRedirect({ role }: { role: UserRole }) {
  const [target] = useState(() => readReturnTo() ?? dashboardPath(role))
  useEffect(() => clearReturnTo(), [])
  return <Navigate to={target} replace />
}
