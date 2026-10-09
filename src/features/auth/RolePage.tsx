import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from './roleIntent'
import { Button } from '../../shared/ui/Button'
import { Alert } from '../../shared/ui/Alert'
import { Logo } from '../../shared/ui/Logo'
import { StripeBackground } from '../../shared/ui/StripeBackground'
import { Spinner } from '../../shared/ui/Spinner'
import { useIsMobileView } from '../../lib/platform/isMobileView'
import { roleChoices } from '../landing/roleChoices'
import { RoleScreen } from '../mobile/RoleScreen'
import { AuthModeBadge } from './AuthModeBadge'
import { useRoleSelection } from './useRoleSelection'

// Same roles and order as the phone screen (`roleChoices`); only the wording is first person on desktop.
const desktopDescriptions: Record<UserRole, string> = {
  student: 'I answer quizzes, practice and learn with others',
  instructor: 'I create quizzes and guide my learners',
}
const roleOptions = roleChoices.map((choice) => ({ ...choice, description: desktopDescriptions[choice.role] }))
const roles = roleOptions.map((option) => option.role)

export function RolePage() {
  const location = useLocation()
  const isMobile = useIsMobileView()
  const selection = useRoleSelection(roles)
  const { requestedMode, destinationMode, status, selectedRole, setSelectedRole, continuing, continueError, optionRefs, handleRadioKeyDown, handleContinue } = selection

  const heading = requestedMode === 'signup' ? 'Let’s set up your account.' : requestedMode === 'continue' ? 'Let’s keep learning.' : 'Welcome back.'

  if (requestedMode === 'continue' && status === 'loading') return <main className="auth-wait"><Spinner label="Checking your account" /></main>
  if (requestedMode === 'continue' && status === 'signedOut') return <Navigate to="/role?mode=signin" replace state={location.state} />
  if (isMobile) return <RoleScreen selection={selection} />

  return (
    <main className="role-screen" id="main-content">
      <StripeBackground variant="fade" />
      <div className="role-topbar"><Logo /><Button to="/" variant="ghost" className="role-back"><ArrowLeft size={16} aria-hidden="true" /> Back to home</Button></div>
      <section className="role-panel" aria-labelledby="role-heading">
        <AuthModeBadge mode={destinationMode} />
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
