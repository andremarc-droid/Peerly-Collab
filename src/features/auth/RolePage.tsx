import { ArrowLeft, ArrowRight, GraduationCap, UserRound, Check } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { RoleIntentMode, UserRole } from './roleIntent'
import { readRoleIntent, saveRoleIntent } from './roleIntent'
import { Button } from '../../shared/ui/Button'
import { Alert } from '../../shared/ui/Alert'
import { Logo } from '../../shared/ui/Logo'
import { StripeBackground } from '../../shared/ui/StripeBackground'
import { Spinner } from '../../shared/ui/Spinner'
import { useAuth } from './useAuth'
import { mapFirebaseAuthError } from './authErrors'
import { consumeReturnTo, rememberReturnTo, returnPathFromState } from '../../app/returnTo'

const roleOptions: { role: UserRole; title: string; description: string; Icon: typeof UserRound }[] = [
  { role: 'student', title: 'Student', description: 'I answer quizzes, practice and learn with others', Icon: UserRound },
  { role: 'instructor', title: 'Instructor', description: 'I create quizzes and guide my learners', Icon: GraduationCap },
]

export function RolePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { status, completeRoleSelection } = useAuth()
  const requestedMode = searchParams.get('mode')
  const previousIntent = readRoleIntent()
  const destinationMode: RoleIntentMode = requestedMode === 'signup'
    ? 'signup'
    : requestedMode === 'continue'
      ? 'continue'
    : requestedMode === 'signin'
      ? 'signin'
      : previousIntent?.mode ?? 'signin'
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  function handleRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % roleOptions.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index + roleOptions.length - 1) % roleOptions.length
    if (nextIndex !== null) {
      event.preventDefault()
      const nextOption = roleOptions[nextIndex]
      setSelectedRole(nextOption.role)
      optionRefs.current[nextIndex]?.focus()
    }
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

  const heading = requestedMode === 'signup' ? 'Let’s set up your account.' : requestedMode === 'continue' ? 'Let’s keep learning.' : 'Welcome back.'

  if (requestedMode === 'continue' && status === 'loading') return <main className="auth-wait"><Spinner label="Checking your account" /></main>
  if (requestedMode === 'continue' && status === 'signedOut') return <Navigate to="/role?mode=signin" replace state={location.state} />

  return (
    <main className="role-screen" id="main-content">
      <StripeBackground variant="fade" />
      <div className="role-topbar"><Logo /><Button to="/" variant="ghost" className="role-back"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Button></div>
      <section className="role-panel" aria-labelledby="role-heading">
        <span className="role-step">A GOOD PLACE TO START <span /> 01 / 02</span>
        <h1 id="role-heading" aria-label="Are you an instructor or a student?">Are you an instructor<br />or a student?</h1>
        <p className="role-subheading">{heading}</p>
        <div className="role-options" role="radiogroup" aria-label="Choose your role">
          {roleOptions.map(({ role, title, description, Icon }, index) => {
            const selected = selectedRole === role
            return (
              <button key={role} ref={(element) => { optionRefs.current[index] = element }} className={`role-option${selected ? ' role-option--selected' : ''}`} type="button" role="radio" aria-checked={selected} tabIndex={selected || (!selectedRole && index === 0) ? 0 : -1} onClick={() => setSelectedRole(role)} onKeyDown={(event) => handleRadioKeyDown(event, index)}>
                <span className="role-option__icon"><Icon size={24} aria-hidden="true" /></span>
                <span className="role-option__copy"><strong>{title}</strong><small>{description}</small></span>
                <span className="role-option__check" aria-hidden="true">{selected && <Check size={18} />}</span>
              </button>
            )
          })}
        </div>
        {continueError && <Alert tone="error" label="Role not saved">{continueError}</Alert>}
        <Button type="button" className="role-continue" disabled={!selectedRole || continuing} onClick={handleContinue}>{continuing ? 'Saving…' : 'Continue'} <ArrowRight size={18} aria-hidden="true" /></Button>
        <p className="role-privacy">Your choice helps us make Peerly Collab feel like yours.</p>
      </section>
      <p className="role-footer">LEARN IT. OWN IT. TOGETHER.</p>
    </main>
  )
}
