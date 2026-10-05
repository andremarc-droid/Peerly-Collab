import { useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { ClassAccentPicker } from './ClassAccentPicker'
import { ClassColorPicker } from './ClassColorPicker'
import type { ClassAccent, ClassColor, ClassWithId } from './types'

export function EditAppearanceDialog({
  open,
  onClose,
  classroom,
  onSave,
  busy = false,
}: {
  open: boolean
  onClose: () => void
  classroom: ClassWithId
  onSave: (color: ClassColor, accent: ClassAccent) => Promise<void>
  busy?: boolean
}) {
  const [color, setColor] = useState<ClassColor>(classroom.color ?? 'navy')
  const [accent, setAccent] = useState<ClassAccent>(classroom.accent ?? 'pinstripe')

  async function handleSave() {
    await onSave(color, accent)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit class appearance"
      description={`Choose a theme color and pattern for ${classroom.name}.`}
    >
      <div className="grid gap-5">
        <ClassColorPicker
          value={color}
          onChange={setColor}
          accent={accent}
          previewName={classroom.name}
          previewSection={[classroom.section, classroom.subject].filter(Boolean).join(' · ') || 'Section · Subject'}
        />
        <ClassAccentPicker value={accent} onChange={setAccent} />
        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={busy}>
            {busy ? 'Saving…' : 'Save appearance'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
