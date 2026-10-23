import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Input } from '../../../shared/ui/Input'
import { normalizeGroupInviteCode } from '../schemas'
import { joinStudyGroupWithCode } from '../services'

interface Props {
  open: boolean
  onClose: () => void
  onJoined: (groupId: string) => void
}

export function JoinGroupDialog({ open, onClose, onJoined }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    const norm = normalizeGroupInviteCode(code)
    if (!norm) return
    setBusy(true)
    setError(null)
    try {
      const res = await joinStudyGroupWithCode(norm)
      setCode('')
      onJoined(res.groupId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join study group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Join a study group"
      description="Enter the 6-character code provided by the group creator."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleJoin()
        }}
        className="grid gap-4"
      >
        {error && <Alert tone="error" label="Error">{error}</Alert>}

        <Input
          label="Invite code"
          name="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. 7K4MNP"
          maxLength={12}
          required
        />

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !code.trim()}>
            {busy ? 'Joining…' : 'Join group'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
