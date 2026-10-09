import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resolveListStatus } from '../../shared/ui/listState'
import { formatDue, formatPoints, turnInState, turnInStateLabel } from './format'
import { subscribeToAssignments, subscribeToMyTurnIns } from './services'
import type { AssignmentWithId, TurnInWithId } from './types'
import '../modules/modules.css'

/** Published assignments for one class, each with the student's own turn-in status. */
export function StudentAssignmentsSection({ classId, studentId }: { classId: string; studentId: string }) {
  const [items, setItems] = useState<AssignmentWithId[]>([])
  const [turnIns, setTurnIns] = useState<TurnInWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => subscribeToAssignments(classId, 'student',
    (next) => { setItems(next); setLoading(false); setError('') },
    (reason) => { setError(reason.message); setLoading(false) }), [classId, retry])

  // A status badge is a nice-to-have: if this lookup fails the assignments still show, just without it.
  useEffect(() => subscribeToMyTurnIns(studentId, setTurnIns, () => setTurnIns([])), [studentId, retry])

  const mine = useMemo(() => new Map(turnIns.filter((item) => item.classId === classId).map((item) => [item.assignmentId, item])), [turnIns, classId])
  const status = resolveListStatus({ loading, error, count: items.length })

  return <section className="grid gap-4" aria-labelledby="student-assignments-heading">
    <header><span className="section-kicker">CLASS WORK</span><h2 id="student-assignments-heading" className="m-0 font-heading text-2xl">Assignments</h2></header>
    {status === 'error' && <Alert tone="error" label="Assignments unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(''); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
    {status === 'loading' && <div className="grid gap-3">{[0, 1].map((index) => <Skeleton key={index} className="h-28 rounded-3xl" label="Loading assignments" />)}</div>}
    {status === 'empty' && <EmptyState title="No assignments yet" description="When your instructor publishes an assignment for this class, it will appear here." />}
    {status === 'ready' && <ul className="module-list" aria-label="Published assignments">{items.map((item) => {
      const state = turnInState(item, mine.get(item.id) ?? null)
      return <li key={item.id} className="module-list__item">
        <DataCard
          title={item.title}
          meta={`${formatDue(item.dueAt)} · ${formatPoints(item.points)}${item.attachments.length ? ` · ${item.attachments.length} ${item.attachments.length === 1 ? 'file' : 'files'}` : ''}`}
          badge={<Badge>{turnInStateLabel[state]}</Badge>}
          actions={<Button to={`/student/classes/${classId}/assignments/${item.id}`} variant="secondary">{state === 'assigned' || state === 'missing' ? 'Open and turn in' : 'Open'}<span className="sr-only"> {item.title}</span></Button>}
        >
          {item.instructions ? <p className="m-0 text-sm text-navy-800-72 line-clamp-2">{item.instructions}</p> : null}
        </DataCard>
      </li>
    })}</ul>}
  </section>
}
