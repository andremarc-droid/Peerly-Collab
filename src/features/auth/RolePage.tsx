import { ArrowLeft, ArrowRight, GraduationCap, UserRound, Check } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { RoleIntentMode, UserRole } from './roleIntent'
import { readRoleIntent, saveRoleIntent } from './roleIntent'
import { Button } from '../../shared/ui/Button'
import { Logo } from '../../shared/ui/Logo'
import { StripeBackground } from '../../shared/ui/StripeBackground'

const roleOptions: { role: UserRole; title: string; description: string; Icon: typeof UserRound }[] = [
  { role: 'student', title: 'Student', description: 'I answer quizzes, practice and learn with others', Icon: UserRound },
  { role: 'instructor', title: 'Instructor', description: 'I create quizzes and guide my learners', Icon: GraduationCap },
]

export function RolePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedMode = searchParams.get('mode')
  const previousIntent = readRoleIntent()
  const destinationMode: RoleIntentMode = requestedMode === 'signup'
    ? 'signup'
    : requestedMode === 'signin'
      ? 'signin'
      : previousIntent?.mode ?? 'signin'
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
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

  function handleContinue() {
    if (!selectedRole) return
    saveRoleIntent({ role: selectedRole, mode: destinationMode })
    navigate(`/${destinationMode}?mode=${destinationMode}`)
  }

  const heading = requestedMode === 'signup' ? 'Let’s set up your account.' : requestedMode === 'continue' ? 'Let’s keep learning.' : 'Welcome back.'

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
        <Button type="button" className="role-continue" disabled={!selectedRole} onClick={handleContinue}>Continue <ArrowRight size={18} aria-hidden="true" /></Button>
        <p className="role-privacy">Your choice helps us make Cool-lab feel like yours.</p>
      </section>
      <p className="role-footer">LEARN IT. OWN IT. TOGETHER.</p>
    </main>
  )
}
