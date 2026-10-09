import { Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resolveListStatus } from '../../shared/ui/listState'
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import { FileList } from './FileList'
import { formatGrade, formatTurnedIn, isLate } from './format'
import { GradeForm } from './GradeForm'
import { clearTurnInGrade, gradeTurnIn, subscribeToTurnIns } from './services'
import type { AssignmentWithId, TurnInWithId } from './types'

type PanelAssignment = Pick<AssignmentWithId, 'id' | 'classId' | 'dueAt' | 'collectorEmail' | 'points'>

function gradeBadge(item: TurnInWithId, points: number | null): string {
  if (item.pendingWrite) return 'Saving…'
  if (!item.gradedAt) return 'Needs grading'
  return item.grade === null ? 'Feedback given' : `Graded · ${formatGrade(item.grade, points)}`
}

export function TurnInsPanel({ assignment }: { assignment: PanelAssignment }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState<TurnInWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const graderId = user?.uid ?? ''

  useEffect(() => subscribeToTurnIns(assignment.classId, assignment.id,
    (next) => { setItems(next); setLoading(false); setError('') },
    (reason) => { setError(reason.message); setLoading(false) }), [assignment.classId, assignment.id, retry])

  const gradedCount = useMemo(() => items.filter((item) => item.gradedAt !== null && !item.pendingWrite).length, [items])
  const unsynced = items.some((item) => item.pendingWrite)
  const status = resolveListStatus({ loading, error, count: items.length })

  async function save(item: TurnInWithId, grade: number | null, feedback: string) {
    await gradeTurnIn({ classId: assignment.classId, assignmentId: assignment.id, studentId: item.studentId, graderId, points: assignment.points, grade, feedback })
    showToast('success', `Saved for ${item.studentName}. They can see it now.`)
  }

  async function clear(item: TurnInWithId) {
    await clearTurnInGrade(assignment.classId, assignment.id, item.studentId)
    showToast('info', `Grade cleared for ${item.studentName}.`)
  }

  return <SectionCard title="Student turn-ins" description={status === 'ready' ? `${items.length} turned in · ${gradedCount} graded · ${items.length - gradedCount} to grade` : 'Work appears here as students hand it in.'} icon={<Users size={20} />}>
    {assignment.collectorEmail && status !== 'loading' && <p className="m-0 text-sm text-navy-800-72">Open files while signed in to {assignment.collectorEmail}. Students share them with that account.</p>}
    {unsynced && <Alert tone="warning" label="Not saved to the server yet">A grade you entered has not reached the server, so students cannot see it. If this stays here, check your connection and turn off any ad blocker or privacy extension for this site, then reload.</Alert>}
    {status === 'loading' && <Skeleton className="h-28 rounded-3xl" label="Loading turn-ins" />}
    {status === 'error' && <Alert tone="error" label="Turn-ins unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
    {status === 'empty' && <EmptyState title="No turn-ins yet" description="When a student turns in files, they will show up here so you can open their work and grade it." />}
    {status === 'ready' && <ol className="turn-in-list" aria-label="Student turn-ins, newest first">{items.map((item) => <li key={item.studentId} className="turn-in-card">
      <div className="turn-in-card__head">
        <h3>{item.studentName}</h3>
        <span className="flex flex-wrap gap-2">
          {isLate(assignment.dueAt, item.turnedInAt) ? <Badge>Late</Badge> : assignment.dueAt ? <Badge>On time</Badge> : null}
          <Badge>{gradeBadge(item, assignment.points)}</Badge>
        </span>
      </div>
      <p className="turn-in-card__time">Turned in {formatTurnedIn(item.turnedInAt)}</p>
      <FileList files={item.files} label={`Files from ${item.studentName}`} />
      <GradeForm key={`${item.studentId}:${item.gradedAt?.toMillis() ?? 0}`} turnIn={item} points={assignment.points}
        onSave={(grade, feedback) => graderId ? save(item, grade, feedback) : Promise.reject(new Error('You need to be signed in to grade.'))}
        onClear={() => clear(item)} />
    </li>)}</ol>}
  </SectionCard>
}
