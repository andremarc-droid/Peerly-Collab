import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Upload,
  Download,
  Copy,
  Edit2,
  Trash2,
  Globe,
  EyeOff,
  MoreVertical,
  Layout,
} from 'lucide-react'
import { AppShell } from '../../app/AppShell'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Alert } from '../../shared/ui/Alert'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { resolveListStatus } from '../../shared/ui/listState'
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import { watchMyClasses } from '../classes/services/classService'
import { subscribeToModules } from '../modules/services'
import { watchQuizzesForClass } from '../classes/services/quizService'
import type { ClassWithId } from '../classes/types'
import type { LearningCanvasWithId } from './types'
import {
  watchClassCanvases,
  createCanvas,
  deleteCanvas,
  duplicate,
  publish,
  unpublish,
  rename,
  getContent,
} from './services'
import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from './jsonCanvas'
import { CreateLearningCanvasDialog } from './components/CreateLearningCanvasDialog'
import { RenameLearningCanvasDialog } from './components/RenameLearningCanvasDialog'
import { LossyImportDialog } from './components/LossyImportDialog'
import { LearningGraphView } from './components/LearningGraphView'

export function InstructorLearningHubPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [classesError, setClassesError] = useState<string | null>(null)

  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [viewMode, setViewMode] = useState<string>('canvases') // 'canvases' | 'graph'

  // Per-class canvases map: classId -> LearningCanvasWithId[]
  const [canvasMap, setCanvasMap] = useState<Record<string, LearningCanvasWithId[]>>({})
  const [moduleTitles, setModuleTitles] = useState<Record<string, string>>({})
  const [quizTitles, setQuizTitles] = useState<Record<string, string>>({})

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)
  const [importedTitle, setImportedTitle] = useState('Imported Canvas')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Watch instructor's classes
  useEffect(() => {
    if (!user) return
    setClassesLoading(true)
    const unsub = watchMyClasses(
      user.uid,
      (items) => {
        setClasses(items)
        setClassesLoading(false)
      },
      (err) => {
        setClassesError(err.message)
        setClassesLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  // 2. Watch canvases, modules, and quizzes for all owned classes
  useEffect(() => {
    if (!classes.length) return
    const unsubs: Array<() => void> = []

    classes.forEach((cls) => {
      // Canvases
      unsubs.push(
        watchClassCanvases(
          cls.id,
          'instructor',
          (items) => {
            setCanvasMap((prev) => ({ ...prev, [cls.id]: items }))
          },
          () => {},
        ),
      )

      // Modules
      unsubs.push(
        subscribeToModules(cls.id, (mods) => {
          setModuleTitles((prev) => {
            const next = { ...prev }
            mods.forEach((m) => {
              next[m.id] = m.title
            })
            return next
          })
        }),
      )

      // Quizzes
      unsubs.push(
        watchQuizzesForClass(
          cls.id,
          (quizzes) => {
            setQuizTitles((prev) => {
              const next = { ...prev }
              quizzes.forEach((q) => {
                next[q.id] = q.title
              })
              return next
            })
          },
          () => {},
        ),
      )
    })

    return () => unsubs.forEach((u) => u())
  }, [classes])

  // Aggregate all loaded canvases
  const allCanvases = Object.values(canvasMap).flat()
  const displayCanvases =
    selectedClassId === 'all'
      ? allCanvases
      : canvasMap[selectedClassId] || []

  const listStatus = resolveListStatus({
    loading: classesLoading,
    error: classesError,
    count: displayCanvases.length,
  })

  const classOptions = classes.map((c) => ({ id: c.id, name: c.name }))
  const activeTargetClassId =
    selectedClassId !== 'all' ? selectedClassId : classes[0]?.id

  const handleCreate = async (title: string, description: string, targetClassId?: string) => {
    if (!user) return
    const classToUse = targetClassId || activeTargetClassId
    if (!classToUse) {
      showToast('error', 'Please create a class before adding a canvas.')
      return
    }
    const newId = await createCanvas(classToUse, user.uid, {
      kind: 'class',
      title,
      description,
    })
    showToast('success', 'Learning canvas created.')
    navigate(`/instructor/classes/${classToUse}/learning/${newId}`)
  }

  const handleRename = async (title: string) => {
    if (!renameTarget) return
    await rename(renameTarget.classId, renameTarget.id, title)
    showToast('success', 'Canvas renamed.')
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteCanvas(deleteTarget.classId, deleteTarget.id)
      showToast('success', 'Learning canvas deleted.')
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleDuplicate = async (canvas: LearningCanvasWithId) => {
    if (!user) return
    try {
      const copyId = await duplicate(canvas.classId, canvas.id, user.uid)
      showToast('success', 'Canvas duplicated.')
      navigate(`/instructor/classes/${canvas.classId}/learning/${copyId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Duplicate failed.')
    }
  }

  const handleTogglePublish = async (canvas: LearningCanvasWithId) => {
    try {
      if (canvas.status === 'published') {
        await unpublish(canvas.classId, canvas.id)
        showToast('success', 'Canvas unpublished (hidden from learners).')
      } else {
        await publish(canvas.classId, canvas.id)
        showToast('success', 'Canvas published (visible to class).')
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Status update failed.')
    }
  }

  const handleExport = async (canvas: LearningCanvasWithId) => {
    try {
      const content = await getContent(canvas.classId, canvas.id)
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
    if (!importResult || !user || !activeTargetClassId) return
    try {
      const newId = await createCanvas(activeTargetClassId, user.uid, {
        kind: 'class',
        title: importedTitle,
        description: 'Imported from JSON Canvas',
        initialContent: importResult.content,
      })
      setImportResult(null)
      showToast('success', 'Canvas imported successfully.')
      navigate(`/instructor/classes/${activeTargetClassId}/learning/${newId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed.')
    }
  }

  const classNameMap = new Map(classes.map((c) => [c.id, c.name]))

  return (
    <AppShell>
      <PageHeader
        eyebrow="STUDY & KNOWLEDGE"
        title="Learning"
        subtitle="Visual concept canvases and interactive knowledge graph."
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={classes.length === 0}
            >
              <Upload size={16} aria-hidden="true" />
              <span>Import .canvas</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => setCreateOpen(true)}
              disabled={classes.length === 0}
            >
              <Plus size={16} aria-hidden="true" />
              <span>New canvas</span>
            </Button>
          </div>
        }
      />

      <input
        type="file"
        ref={fileInputRef}
        accept=".canvas,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      <main className="app-shell__content grid gap-6">
        {/* Navigation & Filters bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-navy-900-15 shadow-xs">
          <SegmentedControl
            label="Learning view mode"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: 'Canvases', value: 'canvases' },
              { label: 'Graph view', value: 'graph' },
            ]}
          />

          {classes.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="learning-class-filter" className="text-xs font-semibold text-navy-800-72">
                Class:
              </label>
              <select
                id="learning-class-filter"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="py-1.5 px-3 text-xs font-semibold text-navy-900 bg-navy-900-05 border border-navy-900-15 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-800"
              >
                <option value="all">All classes ({allCanvases.length})</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({canvasMap[c.id]?.length || 0})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* View mode 1: Graph View */}
        {viewMode === 'graph' && (
          <section aria-label="Learning knowledge graph">
            <LearningGraphView
              canvases={allCanvases}
              classes={classOptions}
              moduleTitles={moduleTitles}
              quizTitles={quizTitles}
              selectedClassId={selectedClassId}
              role="instructor"
            />
          </section>
        )}

        {/* View mode 2: Canvases List */}
        {viewMode === 'canvases' && (
          <section aria-labelledby="learning-canvases-heading" className="grid gap-4">
            <div className="flex items-center justify-between">
              <h2 id="learning-canvases-heading" className="text-xl font-bold text-navy-900 m-0">
                Study Canvases
              </h2>
              <span className="text-xs text-navy-800-72">
                {displayCanvases.length} {displayCanvases.length === 1 ? 'canvas' : 'canvases'}
              </span>
            </div>

            {listStatus.showLoading && (
              <div className="grid gap-3" aria-label="Loading canvases">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            )}

            {listStatus.showError && (
              <Alert tone="error" label="Could not load learning canvases">
                {classesError || 'Unable to load canvases right now.'}
              </Alert>
            )}

            {listStatus.showEmpty && (
              <EmptyState
                title="No learning canvases yet"
                description={
                  classes.length === 0
                    ? 'Create a class first before making learning canvases.'
                    : 'Create whiteboard canvases with concept notes, links, and study materials.'
                }
                action={
                  classes.length > 0 ? (
                    <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
                      <Plus size={16} aria-hidden="true" />
                      <span>Create first canvas</span>
                    </Button>
                  ) : undefined
                }
              />
            )}

            {listStatus.showItems && (
              <div className="grid gap-3" role="list" aria-label="Canvases list">
                {displayCanvases.map((canvas) => {
                  const editHref = `/instructor/classes/${canvas.classId}/learning/${canvas.id}`
                  const className = classNameMap.get(canvas.classId) || 'Class'

                  return (
                    <DataCard
                      key={canvas.id}
                      icon={<Layout size={20} />}
                      title={canvas.title}
                      subtitle={canvas.description || 'No description provided.'}
                      badges={
                        <>
                          <Badge>{className}</Badge>
                          <Badge tone={canvas.status === 'published' ? 'success' : 'neutral'}>
                            {canvas.status === 'published' ? 'Published' : 'Draft'}
                          </Badge>
                          <span className="text-xs text-navy-800-72 ml-1">
                            {canvas.nodeCount} {canvas.nodeCount === 1 ? 'card' : 'cards'} · {canvas.edgeCount} {canvas.edgeCount === 1 ? 'connection' : 'connections'}
                          </span>
                        </>
                      }
                      action={
                        <div className="flex items-center gap-2">
                          <Button to={editHref} variant="secondary">
                            Open canvas
                          </Button>
                          <DropdownMenu
                            label="Canvas options"
                            trigger={
                              <button
                                type="button"
                                className="p-2 text-navy-800 hover:text-navy-900 rounded-xl hover:bg-navy-900-08 min-h-11 min-w-11 inline-flex items-center justify-center"
                                aria-label={`Actions for ${canvas.title}`}
                              >
                                <MoreVertical size={18} aria-hidden="true" />
                              </button>
                            }
                          >
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => setRenameTarget(canvas)}
                            >
                              <Edit2 size={16} aria-hidden="true" />
                              Rename
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleDuplicate(canvas)}
                            >
                              <Copy size={16} aria-hidden="true" />
                              Duplicate
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleTogglePublish(canvas)}
                            >
                              {canvas.status === 'published' ? (
                                <>
                                  <EyeOff size={16} aria-hidden="true" />
                                  Unpublish (make draft)
                                </>
                              ) : (
                                <>
                                  <Globe size={16} aria-hidden="true" />
                                  Publish to learners
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleExport(canvas)}
                            >
                              <Download size={16} aria-hidden="true" />
                              Export (.canvas)
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="text-danger"
                              onClick={() => setDeleteTarget(canvas)}
                            >
                              <Trash2 size={16} aria-hidden="true" />
                              Delete
                            </button>
                          </DropdownMenu>
                        </div>
                      }
                    />
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Dialogs */}
      <CreateLearningCanvasDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        classes={classOptions}
        defaultClassId={activeTargetClassId}
      />

      {renameTarget && (
        <RenameLearningCanvasDialog
          open={Boolean(renameTarget)}
          currentTitle={renameTarget.title}
          onClose={() => setRenameTarget(null)}
          onRename={handleRename}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete learning canvas?"
          message={`Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel={deleteBusy ? 'Deleting…' : 'Delete canvas'}
          confirmVariant="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {importResult && (
        <LossyImportDialog
          open={Boolean(importResult)}
          report={importResult.report}
          onClose={() => setImportResult(null)}
          onConfirm={handleConfirmImport}
        />
      )}
    </AppShell>
  )
}
