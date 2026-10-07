import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, Download, Copy, Edit2, Trash2, Globe, EyeOff, MoreVertical } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Alert } from '../../shared/ui/Alert'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { resolveListStatus } from '../../shared/ui/listState'
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import type { ClassWithId } from '../classes/types'
import type { LearningCanvasWithId } from '../learningCanvas/types'
import {
  watchClassCanvases,
  createCanvas,
  deleteCanvas,
  duplicate,
  publish,
  unpublish,
  rename,
  getContent,
} from '../learningCanvas/services'
import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from '../learningCanvas/jsonCanvas'
import { CreateLearningCanvasDialog } from '../learningCanvas/components/CreateLearningCanvasDialog'
import { RenameLearningCanvasDialog } from '../learningCanvas/components/RenameLearningCanvasDialog'
import { LossyImportDialog } from '../learningCanvas/components/LossyImportDialog'

interface ClassLearningCanvasesTabProps {
  classroom: ClassWithId
}

export function ClassLearningCanvasesTab({ classroom }: ClassLearningCanvasesTabProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [canvases, setCanvases] = useState<LearningCanvasWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryTrigger, setRetryTrigger] = useState(0)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)
  const [importedTitle, setImportedTitle] = useState('Imported Canvas')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const active = classroom.status === 'active'

  useEffect(() => {
    setLoading(true)
    setError(null)
    const unsubscribe = watchClassCanvases(
      classroom.id,
      'instructor',
      (items) => {
        setCanvases(items)
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return () => unsubscribe()
  }, [classroom.id, retryTrigger])

  const listStatus = resolveListStatus({ loading, error, count: canvases.length })

  const handleCreate = async (title: string, description: string) => {
    if (!user) return
    const newId = await createCanvas(classroom.id, user.uid, {
      kind: 'class',
      title,
      description,
    })
    showToast('success', 'Learning canvas created.')
    navigate(`/instructor/classes/${classroom.id}/learning/${newId}`)
  }

  const handleRename = async (title: string) => {
    if (!renameTarget) return
    await rename(classroom.id, renameTarget.id, title)
    showToast('success', 'Canvas renamed.')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteCanvas(classroom.id, deleteTarget.id)
      showToast('success', 'Learning canvas deleted.')
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete canvas.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleDuplicate = async (canvas: LearningCanvasWithId) => {
    if (!user) return
    try {
      const copyId = await duplicate(classroom.id, canvas.id, user.uid)
      showToast('success', 'Canvas duplicated.')
      navigate(`/instructor/classes/${classroom.id}/learning/${copyId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to duplicate canvas.')
    }
  }

  const handleTogglePublish = async (canvas: LearningCanvasWithId) => {
    try {
      if (canvas.status === 'published') {
        await unpublish(classroom.id, canvas.id)
        showToast('info', 'Canvas moved to draft (hidden from students).')
      } else {
        await publish(classroom.id, canvas.id)
        showToast('success', 'Canvas published (visible to class).')
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Status update failed.')
    }
  }

  const handleExport = async (canvas: LearningCanvasWithId) => {
    try {
      const content = await getContent(classroom.id, canvas.id)
      if (!content) {
        showToast('error', 'Canvas content could not be found.')
        return
      }
      const json = toJsonCanvas(content)
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${canvas.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'canvas'}.canvas`
      a.click()
      URL.revokeObjectURL(url)
      showToast('success', 'Canvas downloaded.')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Export failed.')
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const baseName = file.name.replace(/\.(canvas|json)$/i, '')
      setImportedTitle(baseName || 'Imported Canvas')
      const result = fromJsonCanvas(text)
      setImportResult(result)
    } catch {
      showToast('error', 'Unable to parse .canvas file.')
    } finally {
      e.target.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!importResult || !user) return
    try {
      const newId = await createCanvas(classroom.id, user.uid, {
        kind: 'class',
        title: importedTitle,
        description: 'Imported from JSON Canvas',
        initialContent: importResult.content,
      })
      setImportResult(null)
      showToast('success', 'Canvas imported successfully.')
      navigate(`/instructor/classes/${classroom.id}/learning/${newId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed.')
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="class-learning-canvases-heading">
      <input
        ref={fileInputRef}
        type="file"
        accept=".canvas,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload .canvas file"
      />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="section-kicker">STUDY BOARDS</span>
          <h2 id="class-learning-canvases-heading" className="m-0 text-2xl font-bold text-navy-900">
            Learning canvases
          </h2>
          <p className="m-0 mt-1 text-sm text-navy-800-72">
            Non-graded spatial study materials, concept maps, and reference boards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {active && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} aria-hidden="true" />
              <span>Import .canvas</span>
            </Button>
          )}

          {active ? (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              <span>Create canvas</span>
            </Button>
          ) : (
            <Button type="button" disabled>
              Restore class to create
            </Button>
          )}
        </div>
      </header>

      {listStatus === 'loading' && (
        <div className="grid gap-3" aria-label="Loading learning canvases">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {listStatus === 'error' && (
        <Alert
          tone="error"
          title="Could not load learning canvases"
          action={
            <Button type="button" variant="secondary" onClick={() => setRetryTrigger((v) => v + 1)}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {listStatus === 'empty' && (
        <EmptyState
          title="No learning canvases yet"
          description="Create visual concept maps and non-graded study boards for your learners."
          action={
            active ? (
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                <span>Create canvas</span>
              </Button>
            ) : undefined
          }
        />
      )}

      {listStatus === 'ready' && (
        <div className="grid gap-3" role="list" aria-label="Class learning canvases list">
          {canvases.map((canvas) => {
            const isPublished = canvas.status === 'published'
            const editHref = `/instructor/classes/${classroom.id}/learning/${canvas.id}`
            const metaText = `${canvas.nodeCount} ${canvas.nodeCount === 1 ? 'card' : 'cards'} · ${canvas.edgeCount} ${
              canvas.edgeCount === 1 ? 'connection' : 'connections'
            }${canvas.description ? ' — ' + canvas.description : ''}`

            return (
              <DataCard
                key={canvas.id}
                title={canvas.title}
                meta={metaText}
                badge={
                  <Badge className={isPublished ? 'bg-navy-900-8 text-navy-900' : 'bg-navy-900-5 text-navy-800-72'}>
                    {isPublished ? 'Published' : 'Draft'}
                  </Badge>
                }
                actions={
                  <div className="flex items-center gap-2 shrink-0">
                    <Button to={editHref}>
                      Open board
                    </Button>

                    <DropdownMenu
                      label={`Actions for ${canvas.title}`}
                      trigger={<MoreVertical size={18} aria-hidden="true" />}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-menu__item"
                        onClick={() => handleTogglePublish(canvas)}
                      >
                        {isPublished ? <EyeOff size={16} aria-hidden="true" /> : <Globe size={16} aria-hidden="true" />}
                        <span>{isPublished ? 'Move to draft' : 'Publish to class'}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-menu__item"
                        onClick={() => setRenameTarget(canvas)}
                      >
                        <Edit2 size={16} aria-hidden="true" />
                        <span>Rename</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-menu__item"
                        onClick={() => handleDuplicate(canvas)}
                      >
                        <Copy size={16} aria-hidden="true" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-menu__item"
                        onClick={() => handleExport(canvas)}
                      >
                        <Download size={16} aria-hidden="true" />
                        <span>Export .canvas</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="dropdown-menu__item dropdown-menu__item--danger"
                        onClick={() => setDeleteTarget(canvas)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        <span>Delete canvas</span>
                      </button>
                    </DropdownMenu>
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateLearningCanvasDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      {renameTarget && (
        <RenameLearningCanvasDialog
          open={Boolean(renameTarget)}
          onClose={() => setRenameTarget(null)}
          initialTitle={renameTarget.title}
          onRename={handleRename}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete learning canvas?"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? All cards and connections will be permanently removed.`}
        confirmLabel={deleteBusy ? 'Deleting…' : 'Delete canvas'}
        onConfirm={handleDelete}
      />

      {importResult && (
        <LossyImportDialog
          open={Boolean(importResult)}
          onClose={() => setImportResult(null)}
          importResult={importResult}
          mode="catalog"
          onConfirmNewCanvas={handleConfirmImport}
        />
      )}
    </section>
  )
}
