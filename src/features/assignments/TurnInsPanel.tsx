import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resolveListStatus } from '../../shared/ui/listState'
import { FileList } from './FileList'
import { formatTurnedIn, isLate } from './format'
import { subscribeToTurnIns } from './services'
import type { AssignmentWithId, TurnInWithId } from './types'

export function TurnInsPanel({ assignment }: { assignment: Pick<AssignmentWithId, 'id' | 'classId' | 'dueAt' | 'collectorEmail'> }) {
  const [items, setItems] = useState<TurnInWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => subscribeToTurnIns(assignment.classId, assignment.id,
    (next) => { setItems(next); setLoading(false); setError('') },
    (reason) => { setError(reason.message); setLoading(false) }), [assignment.classId, assignment.id, retry])

  const status = resolveListStatus({ loading, error, count: items.length })
  return <SectionCard title="Student turn-ins" description={status === 'ready' ? `${items.length} ${items.length === 1 ? 'student has' : 'students have'} turned in work` : 'Work appears here as students hand it in.'} icon={<Users size={20} />}>
    {assignment.collectorEmail && status !== 'loading' && <p className="m-0 text-sm text-navy-800-72">Open files while signed in to {assignment.collectorEmail}. Students share them with that account.</p>}
    {status === 'loading' && <Skeleton className="h-28 rounded-3xl" label="Loading turn-ins" />}
    {status === 'error' && <Alert tone="error" label="Turn-ins unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
    {status === 'empty' && <EmptyState title="No turn-ins yet" description="When a student turns in files, they will show up here with the time they handed them in." />}
    {status === 'ready' && <ol className="turn-in-list" aria-label="Student turn-ins, newest first">{items.map((item) => <li key={item.studentId} className="turn-in-card">
      <div className="turn-in-card__head"><h3>{item.studentName}</h3>{isLate(assignment.dueAt, item.turnedInAt) ? <Badge>Late</Badge> : assignment.dueAt ? <Badge>On time</Badge> : null}</div>
      <p className="turn-in-card__time">Turned in {formatTurnedIn(item.turnedInAt)}</p>
      <FileList files={item.files} label={`Files from ${item.studentName}`} />
    </li>)}</ol>}
  </SectionCard>
}
