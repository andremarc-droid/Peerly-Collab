import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { mapFirebaseAuthError } from './authErrors'
import { completeGoogleRedirect, prepareLocalAuthPersistence, watchAuthState } from './authService'
import { AuthContext, type AuthStatus } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => {}

    async function initialize() {
      try {
        await prepareLocalAuthPersistence()
      } catch (error) {
        if (active) setAuthError(mapFirebaseAuthError(error))
      }

      try {
        await completeGoogleRedirect()
      } catch (error) {
        if (active) setAuthError(mapFirebaseAuthError(error))
      }

      if (!active) return
      unsubscribe = watchAuthState((nextUser) => {
        setUser(nextUser)
        setStatus(nextUser ? 'signedIn' : 'signedOut')
      }, (error) => {
        setUser(null)
        setStatus('signedOut')
        setAuthError(mapFirebaseAuthError(error))
      })
    }

    void initialize()
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])
  const value = useMemo(() => ({ user, status, authError, clearAuthError }), [user, status, authError, clearAuthError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
