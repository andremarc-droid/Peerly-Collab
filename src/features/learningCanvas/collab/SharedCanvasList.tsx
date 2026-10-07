import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { DataCard } from '../../../shared/ui/DataCard'
import { Alert } from '../../../shared/ui/Alert'
import type { SharedCanvas } from './useSharedCanvases'

interface SharedCanvasListProps {
  items: SharedCanvas[]
  error: string | null
  role: 'student' | 'instructor'
  selectedClassId: string
}

export function SharedCanvasList({ items, error, role, selectedClassId }: SharedCanvasListProps) {
  const visible = items.filter((item) =>
    item.sourceCanvasId !== 'note' && (selectedClassId === 'all' || item.classId === selectedClassId),
  )
  return (
    <section aria-labelledby="shared-canvases-heading" className="grid gap-3">
      <div>
        <span className="section-kicker">SHARED WITH YOU</span>
        <h2 id="shared-canvases-heading" className="m-0 text-xl font-bold text-navy-900">Shared canvases</h2>
      </div>
      {error && <Alert tone="error" label="Could not load shared canvases">{error}</Alert>}
      {!error && visible.length === 0 && (
        <p className="m-0 text-sm text-navy-800">Canvases shared with you will appear here.</p>
      )}
      {visible.map((canvas) => (
        <DataCard
          key={`${canvas.classId}/${canvas.id}`}
          title={canvas.title}
          meta={`${canvas.nodeCount} cards · ${canvas.edgeCount} connections · ${canvas.description || 'No description provided.'}`}
          badge={<Badge>{canvas.shareRole === 'editor' ? 'Can edit' : 'View only'}</Badge>}
          actions={
            <Button
              to={`/${role}/classes/${canvas.classId}/learning/${canvas.id}`}
              variant="secondary"
            >
              Open canvas
            </Button>
          }
        />
      ))}
    </section>
  )
}
