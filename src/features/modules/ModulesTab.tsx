import { BookOpenText, Copy, Ellipsis, MoveDown, MoveUp, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Dialog } from '../../shared/ui/Dialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import type { ClassWithId } from '../classes/types'
import { createModule, deleteModuleCascade, duplicateModule, publishModule, reorderModules, subscribeToModules, unpublishModule } from './services'
import type { ModuleWithId } from './types'
import './modules.css'

export function ModulesTab({ classroom }: { classroom: ClassWithId }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [items, setItems] = useState<ModuleWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [deleting, setDeleting] = useState<ModuleWithId | null>(null)
  const [busyId, setBusyId] = useState('')
  const [draggedId, setDraggedId] = useState('')

  useEffect(() => subscribeToModules(classroom.id, 'instructor', (modules) => { setItems(modules); setLoading(false); setError('') }, (reason) => { setError(reason.message); setLoading(false) }), [classroom.id, retry])

  async function run(module: ModuleWithId, action: () => Promise<unknown>, message: string) {
    setBusyId(module.id)
    try { await action(); showToast('success', message) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The module could not be updated.') }
    finally { setBusyId('') }
  }

  async function create() {
    const title = newTitle.trim()
    if (!title || createBusy) return
    setCreateBusy(true)
    try {
      const id = await createModule(classroom.id, classroom.ownerId, title)
      setNewOpen(false); setNewTitle('')
      navigate(`/instructor/classes/${classroom.id}/modules/${id}?focus=add-resource`)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Module could not be created.') }
    finally { setCreateBusy(false) }
  }

  async function move(module: ModuleWithId, direction: -1 | 1) {
    const from = items.findIndex((item) => item.id === module.id); const to = from + direction
    if (to < 0 || to >= items.length) return
    const next = [...items]; [next[from], next[to]] = [next[to], next[from]]
    await run(module, () => reorderModules(classroom.id, next.map((item) => item.id)), 'Module order saved.')
  }

  function drop(targetId: string) {
    if (!draggedId || draggedId === targetId) return
    const next = [...items]; const from = next.findIndex((item) => item.id === draggedId); const to = next.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0) return
    const [picked] = next.splice(from, 1); next.splice(to, 0, picked)
    const moved = picked
    setDraggedId('')
    void run(moved, () => reorderModules(classroom.id, next.map((item) => item.id)), 'Module order saved.')
  }

  async function remove() {
    if (!deleting) return
    const item = deleting; setDeleting(null)
    await run(item, () => deleteModuleCascade(classroom.id, item.id), `“${item.title}” was deleted.`)
  }

  return <section className="grid gap-5" aria-labelledby="modules-heading">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><span className="section-kicker">CLASS STUDY MATERIAL</span><h2 id="modules-heading" className="m-0 text-2xl">Modules</h2><p className="m-0 mt-1 text-sm text-navy-800-72">Arrange lessons and practice for this class.</p></div>
      <Button type="button" onClick={() => { setNewTitle(''); setNewOpen(true) }} disabled={classroom.status !== 'active'} title={classroom.status !== 'active' ? 'Restore this class before creating modules' : undefined}><Plus size={17} aria-hidden="true" /> New module</Button>
    </header>
    {classroom.status !== 'active' && <Alert tone="warning" label="Archived class">Restore this class before creating or editing modules.</Alert>}
    {error ? (
      <Alert tone="error" label="Modules unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>
    ) : loading ? (
      <div className="grid gap-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-36 rounded-3xl" label="Loading modules" />)}</div>
    ) : items.length ? (
      <ol className="module-list" aria-label="Modules in order">{items.map((module, index) => <li key={module.id} draggable onDragStart={() => setDraggedId(module.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(module.id)} onDragEnd={() => setDraggedId('')} className={draggedId === module.id ? 'module-list__item module-list__item--dragging' : 'module-list__item'}>
        <article className="data-card module-card">
          <Link className="module-card__primary" to={`/instructor/classes/${classroom.id}/modules/${module.id}`} aria-label={`Open module ${module.title}`}>
            <span className="module-card__icon" aria-hidden="true"><BookOpenText size={20} /></span>
            <span className="module-card__copy"><span className="data-card__title-row"><strong>{module.title}</strong><Badge>{module.status}</Badge></span><span className="module-card__description">{module.description || 'Add a short description for this module.'}</span><span className="module-card__meta">{module.resourceCount} {module.resourceCount === 1 ? 'resource' : 'resources'} · {module.quizIds.length} attached {module.quizIds.length === 1 ? 'quiz' : 'quizzes'} · Updated {module.updatedAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })}</span></span>
          </Link>
          <div className="module-card__menu"><DropdownMenu label={`More actions for ${module.title}`} trigger={<Ellipsis size={19} aria-hidden="true" />}>
            <Link role="menuitem" to={`/instructor/classes/${classroom.id}/modules/${module.id}`}>Open module</Link>
            <button type="button" role="menuitem" disabled={busyId === module.id} onClick={() => void run(module, async () => { const copyId = await duplicateModule(classroom.id, module.id); navigate(`/instructor/classes/${classroom.id}/modules/${copyId}`) }, 'Draft copy created.') }><Copy size={16} aria-hidden="true" /> Duplicate</button>
            {module.status === 'published' ? <button type="button" role="menuitem" disabled={busyId === module.id} onClick={() => void run(module, () => unpublishModule(classroom.id, module.id), 'Module unpublished.')}><Send size={16} aria-hidden="true" /> Unpublish</button> : <button type="button" role="menuitem" disabled={busyId === module.id || (module.resourceCount < 1 && module.quizIds.length < 1)} title={module.resourceCount < 1 && module.quizIds.length < 1 ? 'Add at least one resource or quiz first' : undefined} onClick={() => void run(module, () => publishModule(classroom.id, module.id), 'Module published.')}><Send size={16} aria-hidden="true" /> Publish</button>}
            <button type="button" role="menuitem" disabled={index === 0 || busyId === module.id} onClick={() => void move(module, -1)}><MoveUp size={16} aria-hidden="true" /> Move up</button>
            <button type="button" role="menuitem" disabled={index === items.length - 1 || busyId === module.id} onClick={() => void move(module, 1)}><MoveDown size={16} aria-hidden="true" /> Move down</button>
            <button type="button" role="menuitem" disabled={busyId === module.id} onClick={() => setDeleting(module)}><Trash2 size={16} aria-hidden="true" /> Delete</button>
          </DropdownMenu></div>
        </article>
      </li>)}</ol>
    ) : (
      <EmptyState title="Start with a module" description="Build a lesson from links, notes, Drive files, and class quizzes." action={<Button type="button" onClick={() => { setNewTitle(''); setNewOpen(true) }} disabled={classroom.status !== 'active'}><Plus size={16} aria-hidden="true" /> Create your first module</Button>} />
    )}

    <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="New module" description="Start with a title. You can add resources next.">
      <Input label="Module title" name="module-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={120} autoFocus />
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={() => setNewOpen(false)}>Cancel</Button><Button type="button" disabled={!newTitle.trim() || createBusy} onClick={() => void create()}>{createBusy ? 'Creating…' : 'Create module'}</Button></div>
    </Dialog>
    <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={() => void remove()} title="Delete this module?" description={deleting ? `“${deleting.title}” and its resource links will be removed. The Google Drive files themselves are not deleted.` : ''} confirmLabel="Delete module" />
  </section>
}
