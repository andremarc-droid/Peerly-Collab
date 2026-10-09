import { ClipboardList, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { Dialog } from '../../shared/ui/Dialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resolveListStatus } from '../../shared/ui/listState'
import { useToast } from '../../shared/ui/useToast'
import type { ClassWithId } from '../classes/types'
import { formatDue, formatPoints } from './format'
import { createAssignment, deleteAssignmentCascade, publishAssignment, subscribeToAssignments, unpublishAssignment } from './services'
import { MAX_TITLE_LENGTH, type AssignmentWithId } from './types'
import '../modules/modules.css'

export function AssignmentsTab({ classroom }: { classroom: ClassWithId }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [items, setItems] = useState<AssignmentWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [deleting, setDeleting] = useState<AssignmentWithId | null>(null)
  const [busyId, setBusyId] = useState('')
  const active = classroom.status === 'active'
  const base = `/instructor/classes/${classroom.id}/assignments`

  useEffect(() => subscribeToAssignments(classroom.id, 'instructor',
    (next) => { setItems(next); setLoading(false); setError('') },
    (reason) => { setError(reason.message); setLoading(false) }), [classroom.id, retry])

  async function run(item: AssignmentWithId, action: () => Promise<unknown>, message: string) {
    setBusyId(item.id)
    try { await action(); showToast('success', message) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The assignment could not be updated.') }
    finally { setBusyId('') }
  }

  async function create() {
    const title = newTitle.trim()
    if (!title || createBusy) return
    setCreateBusy(true)
    try {
      const id = await createAssignment(classroom.id, classroom.ownerId, title)
      setNewOpen(false); setNewTitle('')
      navigate(`${base}/${id}`)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The assignment could not be created.') }
    finally { setCreateBusy(false) }
  }

  function openNew() { setNewTitle(''); setNewOpen(true) }

  async function remove() {
    if (!deleting) return
    const item = deleting; setDeleting(null)
    await run(item, () => deleteAssignmentCascade(classroom.id, item.id), `“${item.title}” was deleted.`)
  }

  const status = resolveListStatus({ loading, error, count: items.length })
  return <section className="grid gap-5" aria-labelledby="assignments-heading">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><span className="section-kicker">WORK FOR STUDENTS</span><h2 id="assignments-heading" className="m-0 text-2xl">Assignments</h2><p className="m-0 mt-1 text-sm text-navy-800-72">Share Word, PDF, Excel and slide files from Google Drive, and collect student work.</p></div>
      <Button type="button" onClick={openNew} disabled={!active} title={active ? undefined : 'Restore this class before creating assignments'}><Plus size={17} aria-hidden="true" /> New assignment</Button>
    </header>
    {!active && <Alert tone="warning" label="Archived class">Restore this class before creating or editing assignments.</Alert>}
    {status === 'error' && <Alert tone="error" label="Assignments unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
    {status === 'loading' && <div className="grid gap-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 rounded-3xl" label="Loading assignments" />)}</div>}
    {status === 'empty' && <EmptyState title="Create your first assignment" description="Attach files from your Google Drive and let students turn in their work from theirs." action={<Button type="button" onClick={openNew} disabled={!active}><Plus size={16} aria-hidden="true" /> New assignment</Button>} />}
    {status === 'ready' && <ul className="module-list" aria-label="Assignments">{items.map((item) => <li key={item.id} className="module-list__item">
      <DataCard
        title={item.title}
        meta={`${formatDue(item.dueAt)} · ${formatPoints(item.points)} · ${item.attachments.length} ${item.attachments.length === 1 ? 'file' : 'files'}`}
        badge={<span className="flex flex-wrap gap-2"><Badge>{item.status === 'published' ? 'Published' : 'Draft'}</Badge>{!item.acceptsTurnIn && <Badge>No turn-in</Badge>}</span>}
        actions={<div className="assignment-actions">
          <Button to={`${base}/${item.id}`} variant="secondary"><ClipboardList size={16} aria-hidden="true" /> Open<span className="sr-only"> {item.title}</span></Button>
          {item.status === 'published'
            ? <Button type="button" variant="secondary" disabled={busyId === item.id} onClick={() => void run(item, () => unpublishAssignment(classroom.id, item.id), 'Assignment unpublished.')}><Send size={16} aria-hidden="true" /> Unpublish</Button>
            : <Button type="button" variant="secondary" disabled={busyId === item.id} onClick={() => void run(item, () => publishAssignment(classroom.id, item.id), 'Assignment published.')}><Send size={16} aria-hidden="true" /> Publish</Button>}
          <Button type="button" variant="secondary" className="button--destructive" disabled={busyId === item.id} aria-label={`Delete ${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden="true" /> Delete</Button>
        </div>}
      >
        {item.instructions ? <p className="m-0 text-sm text-navy-800-72 line-clamp-2">{item.instructions}</p> : null}
      </DataCard>
    </li>)}</ul>}

    <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New assignment" description="Start with a title. You can add instructions and files next.">
      <Input label="Assignment title" name="assignment-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={MAX_TITLE_LENGTH} autoFocus />
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button type="button" disabled={!newTitle.trim() || createBusy} onClick={() => void create()}>{createBusy ? 'Creating…' : 'Create assignment'}</Button></div>
    </Dialog>
    <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => void remove()} title="Delete this assignment?" description={deleting ? `“${deleting.title}” and every student’s turn-in record will be removed. The files themselves stay in Google Drive and are not deleted.` : ''} confirmLabel="Delete assignment" />
  </section>
}
