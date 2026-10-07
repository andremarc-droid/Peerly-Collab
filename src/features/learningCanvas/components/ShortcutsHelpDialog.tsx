import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'

interface ShortcutsHelpDialogProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { key: 'N', description: 'Add new text card at board center' },
  { key: 'G', description: 'Add new group container' },
  { key: 'Delete / Backspace', description: 'Delete selected cards or connection' },
  { key: 'Ctrl + Z', description: 'Undo last change' },
  { key: 'Ctrl + Shift + Z / Ctrl + Y', description: 'Redo last undone change' },
  { key: 'Ctrl + D', description: 'Duplicate selected cards' },
  { key: 'Ctrl + A', description: 'Select all cards' },
  { key: 'Arrow keys', description: 'Nudge selected cards (Shift for 20px snap)' },
  { key: 'F', description: 'Fit all cards within viewport' },
  { key: '/', description: 'Focus search bar' },
  { key: 'Double-click empty canvas', description: 'Quick-add text card at mouse position' },
  { key: 'Drag handle to empty space', description: 'Quick-add and connect a new card' },
  { key: '?', description: 'Open this shortcuts help' },
]

export function ShortcutsHelpDialog({ open, onClose }: ShortcutsHelpDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Quick actions for interacting with the whiteboard."
      className="max-w-md"
    >
      <div className="grid gap-2 max-h-80 overflow-y-auto pr-1">
        {SHORTCUTS.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between gap-3 p-2 rounded-xl bg-surface-primary border border-navy-900-12 text-xs"
          >
            <span className="text-navy-900 font-medium">{s.description}</span>
            <kbd className="px-2 py-1 font-mono text-navy-900 font-bold bg-white border border-navy-900-20 rounded shadow-xs shrink-0">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-3 border-t border-navy-900-8 mt-2">
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  )
}
