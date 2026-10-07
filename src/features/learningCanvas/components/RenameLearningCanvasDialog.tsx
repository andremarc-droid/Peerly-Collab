import { useState, useEffect } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import { LEARNING_CANVAS_TITLE_MAX, LEARNING_CANVAS_DESCRIPTION_MAX } from '../constants'

interface RenameLearningCanvasDialogProps {
  open: boolean
  onClose: () => void
  initialTitle: string
  initialDescription?: string
  onRename: (title: string, description: string) => Promise<void>
}

export function RenameLearningCanvasDialog({
  open,
  onClose,
  initialTitle,
  initialDescription = '',
  onRename,
}: RenameLearningCanvasDialogProps) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(initialTitle)
      setDescription(initialDescription)
      setError(null)
    }
  }, [open, initialTitle, initialDescription])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Title cannot be empty.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onRename(trimmedTitle, description.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update canvas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename canvas"
      description="Update the title and description for this study board."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="grid gap-3">
        {error && (
          <div className="p-2.5 rounded-xl bg-feedback-error-bg text-feedback-error text-xs font-semibold">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="canvas-rename-title" className="block text-xs font-semibold text-navy-900 mb-1">
            Title
          </label>
          <input
            id="canvas-rename-title"
            type="text"
            required
            maxLength={LEARNING_CANVAS_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div>
          <label htmlFor="canvas-rename-desc" className="block text-xs font-semibold text-navy-900 mb-1">
            Description
          </label>
          <textarea
            id="canvas-rename-desc"
            rows={2}
            maxLength={LEARNING_CANVAS_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-navy-900-8">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
