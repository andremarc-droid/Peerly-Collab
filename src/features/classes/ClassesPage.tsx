import { Archive, Copy, Plus, RotateCcw, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../shared/ui/StatTile'
import { Toolbar } from '../../shared/ui/Toolbar'
import { useToast } from '../../shared/ui/useToast'
import { archiveClass, createClass, countMyClasses, restoreClass, watchMyClasses } from './services'
import type { ClassWithId } from './types'
import { countPendingEnrollments, countStudentsInClass, watchEnrollments } from './services/enrollmentService'
import { countClassQuizzes, watchQuizzesForClass } from './services/quizService'
import type { NewClass } from './types'
import { CreateClassDialog } from './CreateClassDialog'
import { ClassPattern } from './ClassPatterns'
import { copyText } from './classUtilities'

type ClassFilter = 'active' | 'archived' | 'all'
interface Counts { students: number; pending: number; quizzes: number }

export function ClassesPage() {
  const { user } = useAuth()
  const ownerId = user?.uid
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [counts, setCounts] = useState<Record<string, Counts>>({})
  const [totalClasses, setTotalClasses] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [queryText, setQueryText] = useState('')
  const [filter, setFilter] = useState<ClassFilter>('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!ownerId) return undefined
    return watchMyClasses(ownerId, (items) => { setClasses(items); setLoading(false) }, (reason) => { setError(reason.message); setLoading(false) })
  }, [ownerId, retry])

  const refreshCounts = useCallback(async (items = classes) => {
    if (!ownerId) return
    try {
      const [classCount, entries] = await Promise.all([
        countMyClasses(ownerId),
        Promise.all(items.map(async (item) => {
          const [students, pending, quizzes] = await Promise.all([
            countStudentsInClass(item.id, ownerId), countPendingEnrollments(item.id, ownerId), countClassQuizzes(item.id, ownerId),
          ])
          return [item.id, { students, pending, quizzes }] as const
        })),
      ])
      setTotalClasses(classCount)
      setCounts(Object.fromEntries(entries))
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Class counts could not be refreshed.') }
  }, [classes, ownerId, showToast])

  useEffect(() => { void refreshCounts() }, [refreshCounts])
  useEffect(() => {
    if (!ownerId || !classes.length) return undefined
    const stop = classes.flatMap((item) => [
      watchEnrollments(item.id, ownerId, () => void refreshCounts(), () => void refreshCounts()),
      watchQuizzesForClass(item.id, ownerId, () => void refreshCounts(), () => void refreshCounts()),
    ])
    return () => stop.forEach((unsubscribe) => unsubscribe())
  }, [classes, ownerId, refreshCounts])

  const visible = useMemo(() => classes.filter((item) => (filter === 'all' || item.status === filter)
    && `${item.name} ${item.section} ${item.subject}`.toLocaleLowerCase().includes(queryText.trim().toLocaleLowerCase())), [classes, filter, queryText])
  const allStudents = Object.values(counts).reduce((total, item) => total + item.students, 0)
  const allPending = Object.values(counts).reduce((total, item) => total + item.pending, 0)

  async function create(input: NewClass) {
    setCreating(true)
    try {
      const created = await createClass(input)
      showToast('success', `“${created.name}” is ready. Share the join code with students.`)
      setCreateOpen(false)
      navigate(`/instructor/classes/${created.id}`, { state: { shareCode: true } })
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The class could not be created.') }
    finally { setCreating(false) }
  }

  async function toggleArchive(item: ClassWithId) {
    setBusyId(item.id)
    try {
      await (item.status === 'active' ? archiveClass(item.id) : restoreClass(item.id))
      showToast('success', item.status === 'active' ? 'Class archived.' : 'Class restored.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Class status could not be changed.') }
    finally { setBusyId(null) }
  }

  return <AppShell>
    <PageHeader eyebrow="INSTRUCTOR SPACE" title="My classes." subtitle="Organize learners, share invitations, and create class-specific practice." action={<Button type="button" onClick={() => setCreateOpen(true)}><Plus size={18} aria-hidden="true" /> Create class</Button>} />
    <main className="app-shell__content grid gap-8" id="main-content">
      <StatRow><StatTile label="Classes" value={String(totalClasses)} hint="Active and archived" /><StatTile label="Students" value={String(allStudents)} hint="Active enrollments" /><StatTile label="Pending requests" value={String(allPending)} hint="Waiting for your approval" /></StatRow>
      <section className="grid gap-5" aria-labelledby="classes-heading">
        <header className="flex flex-wrap items-end justify-between gap-3"><div><span className="section-kicker">YOUR TEACHING SPACE</span><h2 id="classes-heading" className="m-0 font-heading text-2xl">Classes</h2></div><span className="text-sm text-navy-800-72">{visible.length} {visible.length === 1 ? 'class' : 'classes'}</span></header>
        <Toolbar query={queryText} onQueryChange={setQueryText} placeholder="Search classes" filters={<Select label="Status" name="class-status" value={filter} onChange={(event) => setFilter(event.target.value as ClassFilter)} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All classes' }]} />} />
        {error && <Alert tone="error" label="Classes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
        {loading ? <div className="grid gap-4" aria-label="Loading classes">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-48 rounded-3xl" label="Loading class" />)}</div>
          : visible.length ? <div className="grid gap-4">{visible.map((item) => <DataCard key={item.id} title={item.name} meta={[item.section, item.subject].filter(Boolean).join(' · ') || 'No section or subject'} badge={<div className="flex flex-wrap gap-2"><Badge>{item.status === 'active' ? 'Active' : 'Archived'}</Badge>{counts[item.id]?.pending ? <Badge>{counts[item.id].pending} pending</Badge> : null}</div>}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><ClassPattern accent={item.accent} /><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-semibold tracking-[0.2em]">{item.joinCode}</span><Button type="button" variant="secondary" onClick={() => void copyText(item.joinCode).then(() => showToast('success', 'Join code copied.')).catch((reason: unknown) => showToast('error', reason instanceof Error ? reason.message : 'Could not copy the code.'))}><Copy size={15} aria-hidden="true" /> Copy code</Button></div></div>
            <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-800-72"><span><Users size={15} className="mr-1 inline" aria-hidden="true" />{counts[item.id]?.students ?? 0} students</span><span>{counts[item.id]?.quizzes ?? 0} quizzes</span></p>
            <div className="flex flex-wrap gap-2"><Button to={`/instructor/classes/${item.id}`} variant="secondary">Open</Button><Button type="button" variant="secondary" disabled={busyId === item.id} onClick={() => void toggleArchive(item)}>{item.status === 'active' ? <><Archive size={15} aria-hidden="true" /> Archive</> : <><RotateCcw size={15} aria-hidden="true" /> Restore</>}</Button></div>
          </DataCard>)}</div>
          : classes.length === 0 ? <EmptyState title="Create your first class" description="Classes keep student rosters, invitations, and quizzes together in one place." action={<Button type="button" onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> Create your first class</Button>} />
            : <p role="status" className="rounded-2xl border border-navy-900-12 p-6 text-navy-800-72">No classes match your search and status filter.</p>}
      </section>
    </main>
    <CreateClassDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={create} ownerId={ownerId ?? ''} ownerName={user?.displayName ?? 'Instructor'} busy={creating} />
  </AppShell>
}
