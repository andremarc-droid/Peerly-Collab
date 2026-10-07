import { useState } from 'react'
import { Dialog } from '../../../shared/ui/Dialog'
import { Button } from '../../../shared/ui/Button'
import type { LearningCanvasNode, LearningCanvasArrow } from '../types'
import { LEARNING_CANVAS_EDGE_LABEL_MAX } from '../constants'

interface ConnectCardsDialogProps {
  open: boolean
  onClose: () => void
  nodes: LearningCanvasNode[]
  onConnect: (sourceId: string, targetId: string, arrow: LearningCanvasArrow, label?: string) => void
  initialSourceId?: string
}

export function ConnectCardsDialog({
  open,
  onClose,
  nodes,
  onConnect,
  initialSourceId,
}: ConnectCardsDialogProps) {
  const [sourceId, setSourceId] = useState(initialSourceId ?? nodes[0]?.id ?? '')
  const [targetId, setTargetId] = useState(
    nodes.find((n) => n.id !== (initialSourceId ?? nodes[0]?.id))?.id ?? ''
  )
  const [arrow, setArrow] = useState<LearningCanvasArrow>('to')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const getNodeName = (node: LearningCanvasNode) => {
    if (node.type === 'text') return `Text: ${node.text ? node.text.slice(0, 30) : '(empty)'}`
    if (node.type === 'link') return `Link: ${node.link?.title || node.link?.url || '(empty)'}`
    if (node.type === 'reference') return `Reference: ${node.reference?.refType}`
    if (node.type === 'group') return `Group: ${node.group?.label || '(empty)'}`
    return `Card ${(node as { id?: string }).id ?? ''}`
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceId || !targetId) {
      setError('Please choose both a source and target card.')
      return
    }
    if (sourceId === targetId) {
      setError('Cannot connect a card to itself.')
      return
    }
    setError(null)
    onConnect(sourceId, targetId, arrow, label.trim().slice(0, LEARNING_CANVAS_EDGE_LABEL_MAX) || undefined)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Connect cards"
      description="Create a connection between two cards using your keyboard."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="grid gap-3">
        {error && (
          <div className="p-2.5 rounded-xl bg-feedback-error-bg text-feedback-error text-xs font-semibold">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="connect-source" className="block text-xs font-semibold text-navy-900 mb-1">
            From card
          </label>
          <select
            id="connect-source"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {getNodeName(n)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="connect-target" className="block text-xs font-semibold text-navy-900 mb-1">
            To card
          </label>
          <select
            id="connect-target"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          >
            {nodes
              .filter((n) => n.id !== sourceId)
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {getNodeName(n)}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="connect-arrow" className="block text-xs font-semibold text-navy-900 mb-1">
            Arrow style
          </label>
          <select
            id="connect-arrow"
            value={arrow}
            onChange={(e) => setArrow(e.target.value as LearningCanvasArrow)}
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          >
            <option value="to">Directed arrow (→)</option>
            <option value="both">Bidirectional arrow (↔)</option>
            <option value="none">Undirected line (—)</option>
          </select>
        </div>

        <div>
          <label htmlFor="connect-label" className="block text-xs font-semibold text-navy-900 mb-1">
            Label (optional)
          </label>
          <input
            id="connect-label"
            type="text"
            value={label}
            maxLength={LEARNING_CANVAS_EDGE_LABEL_MAX}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. leads to, requires, relates to"
            className="w-full p-2 text-sm text-navy-900 bg-white border border-navy-900-20 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-navy-900-8">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
