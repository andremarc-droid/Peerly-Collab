import { AlertCircle, FileText } from 'lucide-react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import type { FromJsonCanvasResult } from '../jsonCanvas'

interface LossyImportDialogProps {
  open: boolean
  onClose: () => void
  importResult: FromJsonCanvasResult
  onConfirmReplace?: () => void
  onConfirmNewCanvas?: () => void
  mode?: 'editor' | 'catalog'
}

export function LossyImportDialog({
  open,
  onClose,
  importResult,
  onConfirmReplace,
  onConfirmNewCanvas,
  mode = 'editor',
}: LossyImportDialogProps) {
  const { content, report } = importResult
  const warnings = report.notes
  const nodeCount = content.nodes.length
  const edgeCount = content.edges.length

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import .canvas file"
      description="Review imported cards, connections, and automatic conversions before proceeding."
      className="max-w-md"
    >
      <div className="grid gap-3">
        {/* Summary Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-primary border border-navy-900-12">
          <span className="p-2 rounded-lg bg-navy-900-8 text-navy-900 shrink-0">
            <FileText size={18} aria-hidden="true" />
          </span>
          <div className="text-xs">
            <div className="font-bold text-navy-900">
              {nodeCount} cards ready to import
            </div>
            <div className="text-navy-800-72">
              {edgeCount} connections preserved
            </div>
          </div>
        </div>

        {/* Warnings / Conversions Report */}
        {warnings.length > 0 && (
          <div className="p-3 rounded-xl bg-feedback-warning/10 border border-feedback-warning/30 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-navy-900 mb-1.5">
              <AlertCircle size={15} className="text-feedback-warning shrink-0" aria-hidden="true" />
              <span>Conversion report ({warnings.length})</span>
            </div>
            <ul className="pl-4 m-0 space-y-1 text-navy-900 list-disc max-h-36 overflow-y-auto">
              {warnings.map((w, idx) => (
                <li key={idx} className="leading-snug">
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-navy-900-8">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          {mode === 'editor' && onConfirmReplace && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onConfirmReplace()
                onClose()
              }}
            >
              Replace current canvas
            </Button>
          )}

          {onConfirmNewCanvas && (
            <Button
              type="button"
              onClick={() => {
                onConfirmNewCanvas()
                onClose()
              }}
            >
              Add as new canvas
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}
