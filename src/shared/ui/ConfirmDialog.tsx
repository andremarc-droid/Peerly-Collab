import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  requiredName?: string
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', requiredName }: ConfirmDialogProps) {
  const [typedName, setTypedName] = useState('')
  const confirmed = !requiredName || typedName === requiredName
  function close() { setTypedName(''); onClose() }
  return (
    <Dialog open={open} onClose={close} title={title} description={description}>
      <Alert tone="warning" label="Please review">This action may be permanent.</Alert>
      {requiredName && <label className="field"><span className="field__label">Type <strong>{requiredName}</strong> to confirm</span><input className="field__control" value={typedName} onChange={(event) => setTypedName(event.target.value)} autoComplete="off" /></label>}
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
        <Button type="button" variant="primary" className="button--destructive" disabled={!confirmed} onClick={() => { onConfirm(); close() }}><TriangleAlert size={17} aria-hidden="true" />{confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
