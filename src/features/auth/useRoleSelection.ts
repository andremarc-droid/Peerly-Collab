import { useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { consumeReturnTo, rememberReturnTo, returnPathFromState } from '../../app/returnTo'
import { mapFirebaseAuthError } from './authErrors'
import { readRoleIntent, saveRoleIntent, type RoleIntentMode, type UserRole } from './roleIntent'
import { useAuth } from './useAuth'

/** The `mode` query parameter wins; without a valid one the last saved intent decides, then sign in. */
export function resolveRoleMode(requested: string | null, previous: RoleIntentMode | undefined): RoleIntentMode {
  if (requested === 'signup' || requested === 'signin' || requested === 'continue') return requested
  return previous ?? 'signin'
}

/** Everything the role screen does, shared by the desktop page and the phone screen. `roles` is the display order. */
export function useRoleSelection(roles: readonly UserRole[]) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { status, completeRoleSelection } = useAuth()
  const requestedMode = searchParams.get('mode')
  const destinationMode = resolveRoleMode(requestedMode, readRoleIntent()?.mode)
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % roles.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + roles.length - 1) % roles.length
    if (nextIndex === null) return
    event.preventDefault()
    setSelectedRole(roles[nextIndex])
    optionRefs.current[nextIndex]?.focus()
  }

  async function handleContinue() {
    if (!selectedRole) return
    saveRoleIntent({ role: selectedRole, mode: destinationMode })
    if (destinationMode === 'continue') {
      setContinuing(true)
      setContinueError(null)
      try {
        await completeRoleSelection(selectedRole)
        navigate(consumeReturnTo(location.state, selectedRole), { replace: true })
      } catch (error) {
        setContinueError(mapFirebaseAuthError(error))
      } finally {
        setContinuing(false)
      }
      return
    }
    rememberReturnTo(returnPathFromState(location.state))
    navigate(`/${destinationMode}?mode=${destinationMode}`, { state: location.state })
  }

  return {
    requestedMode,
    destinationMode,
    status,
    selectedRole,
    setSelectedRole,
    continuing,
    continueError,
    optionRefs,
    handleRadioKeyDown,
    handleContinue,
  }
}

export type RoleSelection = ReturnType<typeof useRoleSelection>
