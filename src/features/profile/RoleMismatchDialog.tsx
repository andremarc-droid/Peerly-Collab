import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CircleAlert, LogOut, MoveRight } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { signOutCurrentUser } from '../auth/authService'
import { useAuth } from '../auth/useAuth'

function titleCase(role: string): string {
  return `${role.charAt(0).toUpperCase()}${role.slice(1)}`
}

export function RoleMismatchDialog() {
  const { user, roleMismatch, continueWithAccountRole } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (roleMismatch) titleRef.current?.focus()
  }, [roleMismatch])

  if (!roleMismatch || !user) return null

  async function handleSignOut() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      await signOutCurrentUser()
      continueWithAccountRole()
    } catch {
      setError('We couldn’t sign you out. Please try again.')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="role-conflict-backdrop">
      <div ref={dialogRef} className="role-conflict-dialog" role="alertdialog" aria-modal="true" aria-labelledby="role-conflict-title" aria-describedby="role-conflict-description" onKeyDown={trapFocus}>
        <Card>
          <span className="role-conflict-mark"><CircleAlert size={24} aria-hidden="true" /><span className="sr-only">Account role mismatch</span></span>
          <h2 id="role-conflict-title" ref={titleRef} tabIndex={-1}>This account has a different role</h2>
          <p id="role-conflict-description">This account is registered as <strong>{roleMismatch === 'instructor' ? 'an Instructor' : 'a Student'}</strong>. Continue as that role?</p>
          {error && <Alert tone="error" label="Sign out failed">{error}</Alert>}
          <div className="role-conflict-actions">
            <Button type="button" onClick={continueWithAccountRole}>Continue as {titleCase(roleMismatch)} <MoveRight size={17} aria-hidden="true" /></Button>
            <Button type="button" variant="secondary" onClick={handleSignOut} disabled={busy}><LogOut size={16} aria-hidden="true" /> {busy ? 'Signing out…' : 'Sign out'}</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
