import { useState } from 'react'
import { FileText, Layout } from 'lucide-react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import { LEARNING_CANVAS_TITLE_MAX } from '../constants'

export type AddNodeType = 'note' | 'learning' | 'module' | 'quiz'

interface AddNodeDialogProps {
  open: boolean
  onClose: () => void
  onCreateNote: (data: { classId: string; title: string; content: string }) => Promise<void>
  onCreateCanvas: (data: { classId: string; title: string; description: string }) => Promise<void>
  classes: Array<{ id: string; name: string }>
  defaultClassId?: string
  moduleTitles?: Record<string, string>
  quizTitles?: Record<string, string>
}

export function AddNodeDialog({
  open,
  onClose,
  onCreateNote,
  onCreateCanvas,
  classes,
  defaultClassId,
}: AddNodeDialogProps) {
  const [nodeType, setNodeType] = useState<AddNodeType>('note')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [description, setDescription] = useState('')
  const [targetClassId, setTargetClassId] = useState(defaultClassId || (classes[0]?.id ?? ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setError('Please provide a title.')
      return
    }

    const classToUse = targetClassId || defaultClassId || classes[0]?.id
    if (!classToUse) {
      setError('Please select or create a class first.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      if (nodeType === 'note') {
        await onCreateNote({
          classId: classToUse,
          title: trimmedTitle,
          content: content.trim(),
        })
      } else if (nodeType === 'learning') {
        await onCreateCanvas({
          classId: classToUse,
          title: trimmedTitle,
          description: description.trim(),
        })
      }
      onClose()
      setTitle('')
      setContent('')
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add node to graph.')
    } finally {
      setLoading(false)
    }
  }

  const tabOptions = [
    { type: 'note' as const, label: 'Concept Note', icon: FileText, desc: 'A rich markdown note that lives as a node.' },
    { type: 'learning' as const, label: 'Canvas Board', icon: Layout, desc: 'A visual spatial whiteboard.' },
  ]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to Knowledge Graph"
      description="Create a concept note or canvas board to expand your knowledge network."
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && (
          <div className="p-2.5 rounded-xl bg-feedback-error-bg text-feedback-error text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Node Type Selector */}
        <div>
          <label className="block text-xs font-semibold text-navy-900 mb-1.5">
            Element Type
          </label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Element type">
            {tabOptions.map((opt) => {
              const Icon = opt.icon
              const isSelected = nodeType === opt.type
              return (
                <button
                  key={opt.type}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setNodeType(opt.type)}
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-colors min-h-11 ${
                    isSelected
                      ? 'border-navy-900 bg-navy-700-05 text-navy-900'
                      : 'border-navy-900-12 bg-white text-navy-800-72 hover:border-navy-900-30'
                  }`}
                >
                  <Icon size={18} className="mt-0.5 shrink-0 text-navy-900" />
                  <div>
                    <span className="block text-xs font-bold text-navy-900">{opt.label}</span>
                    <span className="block text-[11px] text-navy-800-72 leading-snug mt-0.5">
                      {opt.desc}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Class Selection */}
        {classes.length > 1 && (
          <div>
            <label htmlFor="graph-add-class" className="block text-xs font-semibold text-navy-900 mb-1">
              Class
            </label>
            <select
              id="graph-add-class"
              value={targetClassId}
              onChange={(e) => setTargetClassId(e.target.value)}
              className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div>
          <label htmlFor="graph-add-title" className="block text-xs font-semibold text-navy-900 mb-1">
            {nodeType === 'note' ? 'Note Title' : 'Canvas Title'}
          </label>
          <input
            id="graph-add-title"
            type="text"
            required
            maxLength={LEARNING_CANVAS_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={nodeType === 'note' ? 'e.g. Mitochondria & Cellular ATP' : 'e.g. Energy Pathways Map'}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-12 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        {/* Content for Note */}
        {nodeType === 'note' && (
          <div>
            <label htmlFor="graph-add-content" className="block text-xs font-semibold text-navy-900 mb-1">
              Note Content (Markdown supported)
            </label>
            <textarea
              id="graph-add-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write core concepts, definitions, formulas, or key takeaways here…"
              className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-12 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800 font-sans"
            />
          </div>
        )}

        {/* Description for Canvas */}
        {nodeType === 'learning' && (
          <div>
            <label htmlFor="graph-add-desc" className="block text-xs font-semibold text-navy-900 mb-1">
              Description (optional)
            </label>
            <textarea
              id="graph-add-desc"
              rows={2}
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview or learning goals for this board…"
              className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-12 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-navy-800"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-navy-900-08">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Adding…' : `Add ${nodeType === 'note' ? 'Note' : 'Canvas'}`}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
