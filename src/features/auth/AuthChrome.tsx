import { Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { Logo } from '../../shared/ui/Logo'
import { Spinner } from '../../shared/ui/Spinner'
import { StripeBackground } from '../../shared/ui/StripeBackground'
import { Input } from '../../shared/ui/Input'
import type { UserRole } from './roleIntent'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen" id="main-content">
      <StripeBackground variant="fade" />
      <header className="auth-screen__header"><Logo /><Link to="/" className="auth-home-link">Back to home</Link></header>
      <div className="auth-screen__content">{children}</div>
      <p className="auth-screen__footer">COOL-LAB · LEARN IT. OWN IT. TOGETHER.</p>
    </main>
  )
}

export function AuthCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card elevated className={`auth-card ${className}`.trim()}>{children}</Card>
}

export function RoleChip({ role, mode }: { role: UserRole; mode: 'signup' | 'signin' }) {
  const label = role === 'student' ? 'Student' : 'Instructor'
  return <div className="auth-role-line"><Badge>{label} account</Badge><Link to={`/role?mode=${mode}`}>Change</Link></div>
}

export function GoogleSignInButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button type="button" variant="secondary" className="google-button" onClick={onClick} disabled={disabled}>
      <span className="google-mark" aria-hidden="true">G</span> Continue with Google <LogIn size={16} aria-hidden="true" />
    </Button>
  )
}

export function PasswordField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  visible,
  onToggle,
  disabled,
}: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  autoComplete: string
  visible: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const inputId = useId()
  return (
    <div className="password-field">
      <Input id={inputId} label={label} name={name} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} error={error} hint={hint} autoComplete={autoComplete} disabled={disabled} className="password-field__input" />
      <button type="button" className="password-field__toggle" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} aria-controls={inputId} onClick={onToggle} disabled={disabled}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}

export function AuthLoadingCard({ label = 'Checking your session' }: { label?: string }) {
  return <AuthShell><AuthCard className="auth-card--loading"><Spinner label={label} /><span>{label}</span></AuthCard></AuthShell>
}

export function AccountTypeHint({ role }: { role: UserRole }) {
  return <span className="account-type-hint"><ShieldCheck size={15} aria-hidden="true" /> Set up your {role} account</span>
}
