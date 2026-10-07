import { useState } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import { LEARNING_CANVAS_TITLE_MAX, LEARNING_CANVAS_DESCRIPTION_MAX } from '../constants'

interface CreateLearningCanvasDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (title: string, description: string) => Promise<void>
  isPersonal?: boolean
}

export function CreateLearningCanvasDialog({
  open,
  onClose,
  onCreate,
  isPersonal = false,
}: CreateLearningCanvasDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please provide a canvas title.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await onCreate(trimmedTitle, description.trim())
      onClose()
      setTitle('')
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create canvas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isPersonal ? 'New personal study canvas' : 'New learning canvas'}
      description={
        isPersonal
          ? 'Create a private spatial board for your own study notes, links, and diagrams.'
          : 'Create a non-graded spatial study board for your class.'
      }
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="grid gap-3">
        {error && (
          <div className="p-2.5 rounded-xl bg-feedback-error-bg text-feedback-error text-xs font-semibold">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="canvas-create-title" className="block text-xs font-semibold text-navy-900 mb-1">
            Canvas title
          </label>
          <input
            id="canvas-create-title"
            type="text"
            required
            maxLength={LEARNING_CANVAS_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Cellular Energetics & Respiration"
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div>
          <label htmlFor="canvas-create-desc" className="block text-xs font-semibold text-navy-900 mb-1">
            Description (optional)
          </label>
          <textarea
            id="canvas-create-desc"
            rows={2}
            maxLength={LEARNING_CANVAS_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview or learning goals for this board…"
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-navy-900-8">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading || !title.trim()}>
            {loading ? 'Creating…' : 'Create canvas'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
