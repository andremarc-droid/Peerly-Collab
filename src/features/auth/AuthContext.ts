import { createContext } from 'react'
import type { User } from 'firebase/auth'
import type { UserRole } from './roleIntent'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  authError: string | null
  clearAuthError: () => void
  profileStatus: 'loading' | 'ready' | 'error'
  profileError: string | null
  roleMismatch: UserRole | null
  completeRoleSelection: (role: UserRole) => Promise<UserRole | null>
  continueWithAccountRole: () => void
  retryProfileSetup: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
