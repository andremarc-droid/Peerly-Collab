import { useAuth } from '../auth/useAuth'

export function useUserProfile() {
  const { profile, profileStatus, profileError } = useAuth()
  return { profile, loading: profileStatus === 'loading', error: profileError }
}
