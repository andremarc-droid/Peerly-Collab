import { UserPlus } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'

interface AccountNotRegisteredDialogProps {
  open: boolean
  onClose: () => void
  onSignUp: () => void
}

export function AccountNotRegisteredDialog({ open, onClose, onSignUp }: AccountNotRegisteredDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Account not registered" description="This account hasn’t been registered yet. Create an account?">
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={onClose}>Not now</Button>
        <Button type="button" variant="primary" onClick={onSignUp}><UserPlus size={17} aria-hidden="true" /> Sign up</Button>
      </div>
    </Dialog>
  )
}
