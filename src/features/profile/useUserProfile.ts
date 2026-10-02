import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from './profileTypes'

interface UserProfileState {
  uid: string | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
}

export function useUserProfile(): UserProfileState {
  const { user, status } = useAuth()
  const [state, setState] = useState<UserProfileState>({ uid: null, profile: null, loading: true, error: null })

  useEffect(() => {
    if (status !== 'signedIn' || !user) {
      return undefined
    }

    let unsubscribe: (() => void) | undefined
    let active = true
    void import('./profileService').then(({ watchUserProfile }) => {
      if (!active) return
      unsubscribe = watchUserProfile(user.uid, (profile) => {
        setState({ uid: user.uid, profile, loading: false, error: null })
      }, () => {
        setState({ uid: user.uid, profile: null, loading: false, error: 'We couldn’t load your profile. Please try again.' })
      })
    }).catch(() => {
      if (active) setState({ uid: user.uid, profile: null, loading: false, error: 'We couldn’t load your profile. Please try again.' })
    })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [status, user])

  if (status !== 'signedIn' || !user) return { uid: null, profile: null, loading: status === 'loading', error: null }
  return state.uid === user.uid ? state : { uid: user.uid, profile: null, loading: true, error: null }
}
