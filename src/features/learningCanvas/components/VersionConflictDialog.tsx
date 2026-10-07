import { AlertTriangle } from 'lucide-react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'

interface VersionConflictDialogProps {
  open: boolean
  onClose: () => void
  onReload: () => void
  onKeepMine: () => void
}

export function VersionConflictDialog({
  open,
  onClose,
  onReload,
  onKeepMine,
}: VersionConflictDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Canvas modified in another session"
      description="Another tab or user saved changes to this canvas while you were editing."
      className="max-w-md"
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-feedback-warning/10 border border-feedback-warning/30 text-xs">
          <AlertTriangle size={18} className="text-feedback-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1 text-navy-900">
            <p className="font-bold m-0">Version conflict detected</p>
            <p className="m-0 leading-relaxed text-navy-800-72">
              Reloading will fetch the latest canvas from the server. Choosing &quot;Keep my changes&quot; will overwrite the server with your current whiteboard.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-navy-900-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onReload()
              onClose()
            }}
          >
            Reload latest version
          </Button>

          <Button
            type="button"
            onClick={() => {
              onKeepMine()
              onClose()
            }}
          >
            Keep my changes
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
