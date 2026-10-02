import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { mapFirebaseAuthError } from './authErrors'
import { completeGoogleRedirect, prepareLocalAuthPersistence, watchAuthState } from './authService'
import { AuthContext, type AuthStatus } from './AuthContext'
import { clearRoleIntent, readRoleIntent } from './roleIntent'
import type { UserRole } from './roleIntent'
import { getRoleMismatch } from '../profile/profileTypes'
import { RoleMismatchDialog } from '../profile/RoleMismatchDialog'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [roleMismatch, setRoleMismatch] = useState<UserRole | null>(null)
  const [profileRetry, setProfileRetry] = useState(0)

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
        if (nextUser) {
          setProfileStatus('loading')
          setProfileError(null)
        } else {
          setProfileStatus('ready')
          setProfileError(null)
          setRoleMismatch(null)
        }
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

  useEffect(() => {
    if (status !== 'signedIn' || !user) {
      return undefined
    }

    let active = true
    const intent = readRoleIntent()
    void import('../profile/profileService').then(({ ensureUserProfile }) => ensureUserProfile(user, intent?.role ?? null)).then((profile) => {
      if (!active) return
      clearRoleIntent()
      setRoleMismatch(getRoleMismatch(intent?.role ?? null, profile.role))
      setProfileStatus('ready')
    }).catch(() => {
      if (!active) return
      setProfileError('We couldn’t prepare your profile. Check your connection and try again.')
      setProfileStatus('error')
    })
    return () => { active = false }
  }, [status, user, profileRetry])

  const completeRoleSelection = useCallback(async (role: UserRole): Promise<UserRole | null> => {
    if (!user) throw new Error('A signed-in account is required to choose a role.')
    setProfileStatus('loading')
    setProfileError(null)
    try {
      const { ensureUserProfile } = await import('../profile/profileService')
      const profile = await ensureUserProfile(user, role)
      clearRoleIntent()
      const mismatch = getRoleMismatch(role, profile.role)
      setRoleMismatch(mismatch)
      setProfileStatus('ready')
      return mismatch
    } catch (error) {
      setProfileError('We couldn’t save your role. Check your connection and try again.')
      setProfileStatus('error')
      throw error
    }
  }, [user])

  const continueWithAccountRole = useCallback(() => {
    clearRoleIntent()
    setRoleMismatch(null)
  }, [])

  const clearAuthError = useCallback(() => setAuthError(null), [])
  const retryProfileSetup = useCallback(() => {
    setProfileStatus('loading')
    setProfileError(null)
    setProfileRetry((attempt) => attempt + 1)
  }, [])
  const value = useMemo(() => ({ user, status, authError, clearAuthError, profileStatus, profileError, roleMismatch, completeRoleSelection, continueWithAccountRole, retryProfileSetup }), [user, status, authError, clearAuthError, profileStatus, profileError, roleMismatch, completeRoleSelection, continueWithAccountRole, retryProfileSetup])
  return <AuthContext.Provider value={value}>{children}<RoleMismatchDialog /></AuthContext.Provider>
}
