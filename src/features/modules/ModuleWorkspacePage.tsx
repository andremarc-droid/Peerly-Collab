import { ArrowLeft, BookOpenText, CirclePlay, File, FileSpreadsheet, FileText, Link2, MoveDown, MoveUp, Plus, Presentation, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import type { ClassWithId } from '../classes/types'
import { watchClass } from '../classes/services/classService'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Textarea } from '../../shared/ui/Textarea'
import { useToast } from '../../shared/ui/useToast'
import { useGoogleDrive } from '../assignments/useGoogleDrive'
import { AttachedQuizzesSection } from './AttachedQuizzesSection'
import { ResourceEditorDialog, type ResourceInput } from './ResourceEditorDialog'
import { addResource, deleteResource, publishModule, reorderResources, subscribeToModules, subscribeToResources, unpublishModule, updateModule, updateResource } from './services'
import type { ModuleResourceWithId, ModuleWithId, ResourceType } from './types'
import './modules.css'

type SaveState = 'saved' | 'saving' | 'error'
const initialFocusParam = 'focus'
const resourceTypeLabel: Record<ResourceType, string> = { drive: 'Google Drive file', youtube: 'YouTube video', link: 'Link', text: 'Note' }

export function ModuleWorkspacePage() {
  const { classId = '', moduleId = '' } = useParams()
  const { showToast } = useToast()
  const drive = useGoogleDrive()
  const [searchParams] = useSearchParams()
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [module, setModule] = useState<ModuleWithId | null>(null)
  const [resources, setResources] = useState<ModuleResourceWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveRetry, setSaveRetry] = useState(0)
  const dirtyRef = useRef(false)
  const [resourceDialog, setResourceDialog] = useState<{ open: boolean; initial?: ModuleResourceWithId; type?: ResourceType }>({ open: false })
  const [removingId, setRemovingId] = useState('')
  const [draggedResource, setDraggedResource] = useState('')
  const undoResourceRef = useRef<ModuleResourceWithId | null>(null)
  const resourcesRef = useRef<ModuleResourceWithId[]>([])

  useEffect(() => {
    if (!classId) return undefined
    return watchClass(classId, (value) => setClassroom(value), (reason) => setLoadError(reason.message))
  }, [classId, retry])

  useEffect(() => {
    if (!classId || !moduleId) return undefined
    return subscribeToModules(classId, 'instructor', (items) => {
      const found = items.find((item) => item.id === moduleId) ?? null
      setModule(found); setLoading(false)
      if (!found) setLoadError('This module could not be found or you do not have access.')
      else setLoadError('')
      if (found && !dirtyRef.current) { setTitle(found.title); setDescription(found.description) }
    }, (reason) => { setLoadError(reason.message); setLoading(false) })
  }, [classId, moduleId, retry])

  useEffect(() => {
    if (!classId || !moduleId || module?.id !== moduleId) return undefined
    return subscribeToResources(classId, moduleId, (items) => { resourcesRef.current = items; setResources(items) }, (reason) => setLoadError(reason.message))
  }, [classId, moduleId, module?.id, retry])

  useEffect(() => {
    if (!module?.id || !dirtyRef.current) return undefined
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void updateModule(classId, moduleId, { title: title.trim(), description }).then(() => {
        dirtyRef.current = false; setSaveState('saved')
      }).catch(() => setSaveState('error'))
    }, saveRetry ? 0 : 650)
    return () => window.clearTimeout(timer)
  }, [title, description, module?.id, classId, moduleId, saveRetry])

  useEffect(() => {
    if (!searchParams.has(initialFocusParam)) return undefined
    const timer = window.setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-label="Add resource"]')?.focus(), 120)
    return () => window.clearTimeout(timer)
  }, [searchParams, module?.id])

  const retrySave = useCallback(() => { if (module) { dirtyRef.current = true; setSaveRetry((value) => value + 1) } }, [module])

  function editTitle(value: string) { dirtyRef.current = true; setTitle(value) }
  function editDescription(value: string) { dirtyRef.current = true; setDescription(value) }

  async function saveResource(value: ResourceInput) {
    if (!module) return
    if (resourceDialog.initial) {
      const { id, order } = resourceDialog.initial
      await updateResource(classId, moduleId, id, { ...value, order })
      showToast('success', 'Resource updated.')
    } else {
      await addResource(classId, moduleId, value)
      showToast('success', 'Resource added.')
    }
    setResourceDialog({ open: false })
  }

  async function removeResource(removed: ModuleResourceWithId) {
    setRemovingId(removed.id)
    try {
      await deleteResource(classId, moduleId, removed.id)
      undoResourceRef.current = removed
      showToast('info', 'Resource removed.', { label: 'Undo', onClick: () => { void undoRemove() } })
      setUndoResource(removed)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Resource could not be removed.') }
    finally { setRemovingId('') }
  }

  const [undoResource, setUndoResource] = useState<ModuleResourceWithId | null>(null)
  useEffect(() => {
    if (!undoResource) return undefined
    const timer = window.setTimeout(() => { undoResourceRef.current = null; setUndoResource(null) }, 10000)
    return () => window.clearTimeout(timer)
  }, [undoResource])

  async function undoRemove() {
    const restore = undoResourceRef.current
    if (!restore) return
    try {
      const { id: _id, order: _order, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = restore
      const newId = await addResource(classId, moduleId, input)
      const ids = [...resourcesRef.current.filter((item) => item.id !== restore.id).map((item) => item.id), newId]
      const target = Math.min(restore.order, ids.length - 1)
      ids.splice(ids.indexOf(newId), 1); ids.splice(target, 0, newId)
      await reorderResources(classId, moduleId, ids)
      undoResourceRef.current = null; setUndoResource(null); showToast('success', 'Resource restored.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The resource could not be restored.') }
  }

  async function moveResource(id: string, offset: -1 | 1) {
    const index = resources.findIndex((item) => item.id === id); const target = index + offset
    if (target < 0 || target >= resources.length) return
    const next = [...resources]; [next[index], next[target]] = [next[target], next[index]]
    try { await reorderResources(classId, moduleId, next.map((item) => item.id)) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Resource order could not be saved.') }
  }

  function dropResource(targetId: string) {
    if (!draggedResource || draggedResource === targetId) return
    const next = [...resources]; const from = next.findIndex((item) => item.id === draggedResource); const to = next.findIndex((item) => item.id === targetId)
    if (from < 0 || to < 0) return
    const [picked] = next.splice(from, 1); next.splice(to, 0, picked); setDraggedResource('')
    void reorderResources(classId, moduleId, next.map((item) => item.id)).catch((reason: unknown) => showToast('error', reason instanceof Error ? reason.message : 'Resource order could not be saved.'))
  }

  async function publish() {
    try { await publishModule(classId, moduleId); showToast('success', 'Module published.') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Module could not be published.') }
  }
  async function unpublish() {
    try { await unpublishModule(classId, moduleId); showToast('success', 'Module unpublished.') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Module could not be unpublished.') }
  }

  if (loading) return <AppShell><PageHeader eyebrow="MODULE" title="Loading module…" subtitle="" /><main className="app-shell__content grid gap-4"><Skeleton className="h-40 rounded-3xl" label="Loading module" /><Skeleton className="h-72 rounded-3xl" label="Loading module resources" /></main></AppShell>
  if (loadError || !module || !classroom) return <AppShell><PageHeader eyebrow="MODULE" title="Module unavailable" subtitle="This module could not be opened." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Module unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setLoadError(''); setRetry((value) => value + 1) }}>Retry</Button>}>{loadError || 'Class details are unavailable.'}</Alert><Button to={'/instructor/classes/' + classId + '?tab=modules'} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to modules</Button></main></AppShell>

  const readyTitle = Boolean(title.trim())
  const readyContent = resources.length > 0 || module.quizIds.length > 0
  const canPublish = readyTitle && readyContent

  return <AppShell>
    <PageHeader eyebrow={module.status === 'published' ? 'PUBLISHED MODULE' : 'DRAFT MODULE'} title={module.title || 'Untitled module'} subtitle={classroom.name} action={<Button to={'/instructor/classes/' + classId + '?tab=modules'} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to modules</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      <nav className="module-breadcrumb" aria-label="Breadcrumb"><Link to="/instructor">Classes</Link><span aria-hidden="true">›</span><Link to={'/instructor/classes/' + classId + '?tab=modules'}>{classroom.name}</Link><span aria-hidden="true">›</span><span aria-current="page">{module.title}</span></nav>
      <SectionCard title="Module details" description="Changes save automatically." icon={<BookOpenText size={20} />} action={<div className="module-save-state" role="status" aria-live="polite">{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? <><span>Couldn’t save</span><Button type="button" variant="ghost" onClick={retrySave}>Retry</Button></> : 'All changes saved'}</div>}>
        <Input label="Title" name="module-title" value={title} maxLength={120} onChange={(event) => editTitle(event.target.value)} error={saveState === 'error' && !title.trim() ? 'A title is required.' : undefined} />
        <Textarea label="Description" name="module-description" value={description} maxLength={1000} onChange={(event) => editDescription(event.target.value)} hint="Optional · up to 1000 characters" />
      </SectionCard>

      <SectionCard title="Resources" description={resources.length + ' of 10 resources'} icon={<FileText size={20} />} action={resources.length >= 10
        ? <div className="module-add-disabled"><Button type="button" disabled aria-describedby="resource-limit-hint"><Plus size={16} aria-hidden="true" /> Add resource</Button><span id="resource-limit-hint">This module already has 10 resources.</span></div>
        : <DropdownMenu label="Add resource" trigger={<><Plus size={16} aria-hidden="true" /> Add resource</>}>
          {(['drive', 'youtube', 'link', 'text'] as ResourceType[]).map((type) => <button role="menuitem" type="button" key={type} onClick={() => setResourceDialog({ open: true, type })}>Add {resourceTypeLabel[type]}</button>)}
        </DropdownMenu>}>
        {resources.length ? <ol className="resource-list" aria-label="Module resources in order">{resources.map((resource, index) => <ResourceRow key={resource.id} resource={resource} index={index} total={resources.length} busy={Boolean(removingId)} onEdit={() => setResourceDialog({ open: true, initial: resource })} onRemove={() => void removeResource(resource)} onMove={moveResource} onDragStart={() => setDraggedResource(resource.id)} onDrop={() => dropResource(resource.id)} onDragEnd={() => setDraggedResource('')} />)}</ol>
          : <EmptyState title="Add your first resource" description="Add a Drive file, video, link, or plain-text note to start this module." action={<Button type="button" onClick={() => setResourceDialog({ open: true, type: 'drive' })}><Plus size={16} aria-hidden="true" /> Add resource</Button>} />}
      </SectionCard>

      <AttachedQuizzesSection classroom={classroom} module={module} />

      <section className="module-publish-bar" aria-label="Publish module">
        <div><strong>{module.status === 'published' ? 'Published module' : 'Ready to publish?'}</strong><ul><li>{readyTitle ? '✓' : '○'} Title</li><li>{readyContent ? '✓' : '○'} At least one resource or attached quiz</li></ul></div>
        <div className="module-publish-actions">
          <Button type="button" variant="secondary" disabled aria-label="Preview as student, coming soon">Preview as student · Coming soon</Button>
          {module.status === 'published' ? <Button type="button" variant="secondary" onClick={() => void unpublish()}><Send size={16} aria-hidden="true" /> Unpublish</Button> : <Button type="button" disabled={!canPublish} title={!readyTitle ? 'Add a title first' : !readyContent ? 'Add at least one resource or attached quiz' : undefined} onClick={() => void publish()}><Send size={16} aria-hidden="true" /> Publish</Button>}
        </div>
      </section>
    </main>
    <ResourceEditorDialog open={resourceDialog.open} initial={resourceDialog.initial} drive={drive} onClose={() => setResourceDialog({ open: false })} onSave={saveResource} />
  </AppShell>
}

function ResourceRow({ resource, index, total, busy, onEdit, onRemove, onMove, onDragStart, onDrop, onDragEnd }: { resource: ModuleResourceWithId; index: number; total: number; busy: boolean; onEdit: () => void; onRemove: () => void; onMove: (id: string, offset: -1 | 1) => void; onDragStart: () => void; onDrop: () => void; onDragEnd: () => void }) {
  const Icon = resource.type === 'youtube'
    ? CirclePlay
    : resource.type === 'drive'
      ? (resource.driveKind === 'doc' ? FileText : resource.driveKind === 'sheet' ? FileSpreadsheet : resource.driveKind === 'slides' ? Presentation : File)
      : resource.type === 'link'
        ? Link2
        : FileText
  let host = resource.type === 'text' ? 'Plain-text note' : ''
  if (resource.url) { try { host = new URL(resource.url).hostname } catch { host = 'Link' } }
  return <li draggable onDragStart={onDragStart} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onDragEnd={onDragEnd} className="resource-list__item">
    <article className="resource-card"><span className="resource-card__icon" aria-hidden="true"><Icon size={19} /></span><div className="resource-card__content"><h3>{resource.title}</h3><p>{host}</p></div><div className="resource-card__actions"><Button type="button" variant="secondary" disabled={busy} onClick={onEdit}>Edit</Button><Button type="button" variant="secondary" disabled={busy} onClick={onRemove}>Remove</Button><Button type="button" variant="ghost" aria-label={'Move ' + resource.title + ' up'} disabled={index === 0 || busy} onClick={() => onMove(resource.id, -1)}><MoveUp size={16} aria-hidden="true" /></Button><Button type="button" variant="ghost" aria-label={'Move ' + resource.title + ' down'} disabled={index === total - 1 || busy} onClick={() => onMove(resource.id, 1)}><MoveDown size={16} aria-hidden="true" /></Button></div></article>
  </li>
}
