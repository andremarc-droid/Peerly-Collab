import { Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react'
import { readRoleIntent } from '../auth/roleIntent'
import { Button } from '../../shared/ui/Button'
import { Logo } from '../../shared/ui/Logo'
import { StripeBackground } from '../../shared/ui/StripeBackground'

interface AccountPlaceholderPageProps {
  mode: 'signup' | 'signin'
}

export function AccountPlaceholderPage({ mode }: AccountPlaceholderPageProps) {
  const intent = readRoleIntent()
  const location = useLocation()
  if (!intent) return <Navigate to={`/role?mode=${mode}`} replace state={{ from: location.pathname }} />

  const isSignup = mode === 'signup'
  const roleLabel = intent.role === 'student' ? 'student' : 'instructor'
  return (
    <main className="placeholder-screen" id="main-content">
      <StripeBackground variant="fade" />
      <div className="placeholder-topbar"><Logo /><Button to="/" variant="ghost"><ArrowLeft size={16} aria-hidden="true" /> Back home</Button></div>
      <section className="placeholder-panel">
        <span className="placeholder-icon"><LockKeyhole size={23} aria-hidden="true" /></span>
        <p className="eyebrow">{roleLabel.toUpperCase()} {isSignup ? 'SIGN UP' : 'SIGN IN'}</p>
        <h1>{isSignup ? 'Your learning space is next.' : 'Good to have you back.'}</h1>
        <p>{isSignup ? `We’re getting the ${roleLabel} account experience ready. Your role is saved for this session.` : `The ${roleLabel} sign-in form is coming next. Your role is saved for this session.`}</p>
        <Button to={`/role?mode=${mode}`}>{isSignup ? 'Review my role' : 'Choose another role'} <ArrowRight size={18} aria-hidden="true" /></Button>
      </section>
      <p className="placeholder-foot">COOL-LAB · LEARN IT. OWN IT. TOGETHER.</p>
    </main>
  )
}
