import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { PasswordField } from '../auth/AuthChrome'
import type { UserRole } from '../auth/roleIntent'
import { canConfirmAccountDeletion } from './accountDeletionRules'

interface DeleteAccountDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: (password: string) => void
  email: string
  role: UserRole
  needsPassword: boolean
  busy: boolean
  error: string | null
}

const consequences: Record<UserRole, string> = {
  instructor: 'Every class you own is deleted for everyone in it, including its quizzes, modules, canvases, flashcards and student enrollments.',
  student: 'You are removed from your classes, and your personal canvases and flashcard decks are deleted.',
}

export function DeleteAccountDialog({ open, onClose, onConfirm, email, role, needsPassword, busy, error }: DeleteAccountDialogProps) {
  const [typedEmail, setTypedEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const ready = canConfirmAccountDeletion({ typedEmail, accountEmail: email, needsPassword, password })

  function handleClose() {
    if (busy) return
    setTypedEmail('')
    setPassword('')
    setShowPassword(false)
    onClose()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (ready && !busy) onConfirm(password)
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Delete your account?" description="This permanently deletes your account. It can’t be undone." className="delete-account-dialog">
      <form className="auth-form delete-account-form" noValidate onSubmit={handleSubmit}>
        <Alert tone="warning" label="This can’t be undone">Your profile and sign-in are permanently deleted.</Alert>
        <p className="delete-account-note">{consequences[role]}</p>
        <Input
          label="Type your email address to confirm"
          name="confirm-email"
          type="email"
          autoComplete="off"
          value={typedEmail}
          onChange={(event) => setTypedEmail(event.target.value)}
          hint={`Enter ${email} to unlock deletion.`}
          disabled={busy}
        />
        {needsPassword
          ? <PasswordField label="Password" name="current-password" autoComplete="current-password" value={password} onChange={setPassword} hint="Confirm it’s you with your password." visible={showPassword} onToggle={() => setShowPassword(!showPassword)} disabled={busy} />
          : <p className="delete-account-note">You’ll be asked to confirm with Google before anything is deleted.</p>}
        {error && <Alert tone="error" label="Account not deleted">{error}</Alert>}
        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" className="button--destructive" disabled={!ready || busy}>
            <Trash2 size={17} aria-hidden="true" /> {busy ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
