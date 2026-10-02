import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { readRoleIntent, type UserRole } from './roleIntent'
import { useAuth } from './useAuth'
import { AuthLoadingCard } from './AuthChrome'

export function AuthGate({ mode, children }: { mode: 'signup' | 'signin'; children: (role: UserRole) => ReactNode }) {
  const intent = readRoleIntent()
  const { status } = useAuth()

  if (!intent) return <Navigate to={`/role?mode=${mode}`} replace />
  if (status === 'loading') return <AuthLoadingCard />
  if (status === 'signedIn') return <Navigate to="/welcome" replace />
  return children(intent.role)
}
