import { createContext } from 'react'
import type { User } from 'firebase/auth'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthContextValue {
  user: User | null
  status: AuthStatus
  authError: string | null
  clearAuthError: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
