import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Textarea } from '../../../shared/ui/Textarea'
import { VALID_REPORT_REASONS } from '../schemas'
import { reportPublicDeck } from '../services'
import type { PublicDeck, ReportReason } from '../types'

interface Props {
  deck: PublicDeck
  reporterUid: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ReportDeckDialog({ deck, reporterUid, open, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState<ReportReason>('inappropriate')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setBusy(true)
    setError(null)
    try {
      await reportPublicDeck({ deckId: deck.id, reason, note }, reporterUid)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Report public deck"
      description={`Report “${deck.title}” for review by our moderation team.`}
    >
      <div className="grid gap-4">
        {error && <Alert tone="error" label="Report failed">{error}</Alert>}

        <fieldset className="grid gap-2 border-none p-0">
          <legend className="mb-2 text-sm font-semibold text-navy-900">Reason for report</legend>
          {(Object.keys(VALID_REPORT_REASONS) as ReportReason[]).map(key => (
            <label key={key} className="flex min-h-11 items-center gap-3 text-base text-navy-900 cursor-pointer">
              <input
                type="radio"
                name="reportReason"
                value={key}
                checked={reason === key}
                onChange={() => setReason(key)}
                className="h-4 w-4 text-navy-900"
              />
              <span>{VALID_REPORT_REASONS[key]}</span>
            </label>
          ))}
        </fieldset>

        <Textarea
          label="Additional details (optional)"
          hint="Provide any helpful context for reviewers."
          rows={3}
          maxLength={500}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Describe the issue..."
        />

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
