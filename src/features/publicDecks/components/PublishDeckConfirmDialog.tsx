import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Input } from '../../../shared/ui/Input'
import type { FlashcardDeckWithId } from '../../flashcards/types'
import { publishPublicDeck } from '../services'

interface Props {
  deck: FlashcardDeckWithId
  authorDisplayName: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function PublishDeckConfirmDialog({
  deck,
  authorDisplayName,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePublish = async () => {
    setBusy(true)
    setError(null)
    try {
      await publishPublicDeck(deck, authorDisplayName, tags)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish deck.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Make deck public?"
      description="Anyone on Peerly Collab will be able to discover, preview, and copy this deck to their library."
    >
      <div className="grid gap-4">
        <Alert tone="info" label="What becomes visible">
          Your deck’s title, description, cards, and your display name (<strong>{authorDisplayName}</strong>) will be public. Private notes, class details, study progress, and your email are never shared.
        </Alert>

        <Input
          label="Subject tags (optional)"
          hint="Comma or space-separated (e.g. biology, cells, exam)"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="biology, cells, anatomy"
          maxLength={100}
        />

        {error && <Alert tone="error" label="Publish failed">{error}</Alert>}

        <p className="m-0 text-sm text-navy-900-72">
          You can unpublish this deck at any time from your deck settings to remove it from public browse immediately.
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void handlePublish()} disabled={busy}>
            {busy ? 'Publishing…' : 'Make public'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
