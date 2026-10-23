import { useState } from 'react'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Input } from '../../../shared/ui/Input'
import { RadioGroup } from '../../../shared/ui/RadioGroup'
import { Textarea } from '../../../shared/ui/Textarea'
import { useAuth } from '../../auth/useAuth'
import { createStudyGroup } from '../services'
import type { StudyGroupPrivacy } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (groupId: string) => void
}

export function CreateGroupDialog({ open, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<StudyGroupPrivacy>('private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const gid = await createStudyGroup(
        { uid: user.uid, displayName: user.displayName || user.email },
        { name, description, privacy },
      )
      setName('')
      setDescription('')
      onCreated(gid)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create study group.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Create study group"
      description="Study together with classmates, share flashcard decks, and practice together."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleCreate()
        }}
        className="grid gap-4"
      >
        {error && <Alert tone="error" label="Error">{error}</Alert>}

        <Input
          label="Group name"
          name="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AP Bio Study Squad"
          maxLength={80}
          required
        />

        <Textarea
          label="Description (optional)"
          name="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this group studying? When do you meet?"
          maxLength={300}
          rows={3}
        />

        <RadioGroup
          label="Group privacy"
          name="group-privacy"
          value={privacy}
          onChange={(val) => setPrivacy(val as StudyGroupPrivacy)}
          options={[
            {
              value: 'private',
              label: 'Private (by invite code or link)',
              hint: 'Only learners with your 6-character code can discover and join.',
            },
            {
              value: 'public',
              label: 'Public (listed in group directory)',
              hint: 'Anyone on Peerly Collab can discover and join your group.',
            },
          ]}
        />

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating group…' : 'Create group'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
