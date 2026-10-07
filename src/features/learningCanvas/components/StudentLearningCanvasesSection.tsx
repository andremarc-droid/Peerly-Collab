import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, Download, Copy, Trash2, Edit2, MoreVertical } from 'lucide-react'
import { Button } from '../../../shared/ui/Button'
import { Badge } from '../../../shared/ui/Badge'
import { DataCard } from '../../../shared/ui/DataCard'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Alert } from '../../../shared/ui/Alert'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DropdownMenu } from '../../../shared/ui/DropdownMenu'
import { resolveListStatus } from '../../../shared/ui/listState'
import { useToast } from '../../../shared/ui/useToast'
import { useAuth } from '../../auth/useAuth'
import type { LearningCanvasWithId } from '../types'
import {
  watchClassCanvases,
  watchMyCanvases,
  createCanvas,
  deleteCanvas,
  copyToMyCanvases,
  rename,
  getContent,
} from '../services'
import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from '../jsonCanvas'
import { CreateLearningCanvasDialog } from './CreateLearningCanvasDialog'
import { RenameLearningCanvasDialog } from './RenameLearningCanvasDialog'
import { LossyImportDialog } from './LossyImportDialog'

interface StudentLearningCanvasesSectionProps {
  classId: string
}

export function StudentLearningCanvasesSection({ classId }: StudentLearningCanvasesSectionProps) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  // Class canvases state (From your instructor)
  const [classCanvases, setClassCanvases] = useState<LearningCanvasWithId[]>([])
  const [classLoading, setClassLoading] = useState(true)
  const [classError, setClassError] = useState<string | null>(null)

  // Personal canvases state (My canvases)
  const [myCanvases, setMyCanvases] = useState<LearningCanvasWithId[]>([])
  const [myLoading, setMyLoading] = useState(true)
  const [myError, setMyError] = useState<string | null>(null)

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)
  const [importedTitle, setImportedTitle] = useState('Imported Study Board')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Watch class canvases (published only for student)
  useEffect(() => {
    setClassLoading(true)
    setClassError(null)
    const unsubscribe = watchClassCanvases(
      classId,
      'student',
      (items) => {
        setClassCanvases(items)
        setClassLoading(false)
      },
      (err) => {
        setClassError(err.message)
        setClassLoading(false)
      },
    )
    return () => unsubscribe()
  }, [classId])

  // Watch my personal canvases
  useEffect(() => {
    if (!user) return
    setMyLoading(true)
    setMyError(null)
    const unsubscribe = watchMyCanvases(
      classId,
      user.uid,
      (items) => {
        setMyCanvases(items)
        setMyLoading(false)
      },
      (err) => {
        setMyError(err.message)
        setMyLoading(false)
      },
    )
    return () => unsubscribe()
  }, [classId, user])

  const classStatus = resolveListStatus({ loading: classLoading, error: classError, count: classCanvases.length })
  const myStatus = resolveListStatus({ loading: myLoading, error: myError, count: myCanvases.length })

  const handleCreatePersonal = async (title: string, description: string) => {
    if (!user) return
    const newId = await createCanvas(classId, user.uid, {
      kind: 'personal',
      title,
      description,
    })
    showToast('success', 'Personal study canvas created.')
    navigate(`/student/classes/${classId}/learning/${newId}`)
  }

  const handleCopyClassCanvas = async (canvas: LearningCanvasWithId) => {
    if (!user) return
    try {
      const copyId = await copyToMyCanvases(classId, canvas.id, user.uid)
      showToast('success', 'Copied to My canvases.')
      navigate(`/student/classes/${classId}/learning/${copyId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to copy canvas.')
    }
  }

  const handleRenamePersonal = async (title: string) => {
    if (!renameTarget) return
    await rename(classId, renameTarget.id, title)
    showToast('success', 'Canvas renamed.')
  }

  const handleDeletePersonal = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await deleteCanvas(classId, deleteTarget.id)
      showToast('success', 'Personal canvas deleted.')
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete canvas.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleExport = async (canvas: LearningCanvasWithId) => {
    try {
      const content = await getContent(classId, canvas.id)
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
      setImportedTitle(baseName || 'Imported Study Board')
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
      const newId = await createCanvas(classId, user.uid, {
        kind: 'personal',
        title: importedTitle,
        description: 'Imported from JSON Canvas',
        initialContent: importResult.content,
      })
      setImportResult(null)
      showToast('success', 'Study canvas imported successfully.')
      navigate(`/student/classes/${classId}/learning/${newId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed.')
    }
  }

  return (
    <section className="grid gap-6 mt-4" aria-labelledby="student-learning-heading">
      <input
        ref={fileInputRef}
        type="file"
        accept=".canvas,.json"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload personal .canvas file"
      />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-navy-900-12 pb-3">
        <div>
          <span className="section-kicker">STUDY BOARDS</span>
          <h2 id="student-learning-heading" className="m-0 text-2xl font-bold text-navy-900">
            Learning canvases
          </h2>
          <p className="m-0 mt-1 text-sm text-navy-800-72">
            Explore visual concept maps from your instructor or build your own study boards.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            <span>Import .canvas</span>
          </Button>

          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            <span>New personal canvas</span>
          </Button>
        </div>
      </header>

      {/* Subsection 1: From your instructor */}
      <div className="grid gap-3" aria-labelledby="instructor-canvases-heading">
        <h3 id="instructor-canvases-heading" className="text-lg font-bold text-navy-900 m-0">
          From your instructor
        </h3>

        {classStatus === 'loading' && (
          <Skeleton className="h-20 rounded-2xl" />
        )}

        {classStatus === 'error' && (
          <Alert tone="error" title="Instructor canvases unavailable">
            {classError}
          </Alert>
        )}

        {classStatus === 'empty' && (
          <div className="p-4 rounded-2xl border border-navy-900-12 bg-white text-sm text-navy-800-72 text-center">
            Your instructor hasn’t published any study canvases yet.
          </div>
        )}

        {classStatus === 'ready' && (
          <div className="grid gap-3" role="list" aria-label="Instructor published canvases list">
            {classCanvases.map((canvas) => (
              <DataCard
                key={canvas.id}
                title={canvas.title}
                meta={`${canvas.nodeCount} cards · ${canvas.edgeCount} connections${canvas.description ? ' — ' + canvas.description : ''}`}
                badge={<Badge className="bg-navy-900-8 text-navy-900">Published</Badge>}
                actions={
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleCopyClassCanvas(canvas)}
                    >
                      <Copy size={14} aria-hidden="true" />
                      <span>Copy to my canvases</span>
                    </Button>
                    <Button to={`/student/classes/${classId}/learning/${canvas.id}`}>
                      View board
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Subsection 2: My canvases */}
      <div className="grid gap-3 mt-2" aria-labelledby="my-canvases-heading">
        <h3 id="my-canvases-heading" className="text-lg font-bold text-navy-900 m-0">
          My canvases
        </h3>

        {myStatus === 'loading' && (
          <Skeleton className="h-20 rounded-2xl" />
        )}

        {myStatus === 'error' && (
          <Alert tone="error" title="Personal canvases unavailable">
            {myError}
          </Alert>
        )}

        {myStatus === 'empty' && (
          <EmptyState
            title="No personal study canvases"
            description="Create your own private board or copy one from your instructor to get started."
            action={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                <span>Create study canvas</span>
              </Button>
            }
          />
        )}

        {myStatus === 'ready' && (
          <div className="grid gap-3" role="list" aria-label="Personal study canvases list">
            {myCanvases.map((canvas) => (
              <DataCard
                key={canvas.id}
                title={canvas.title}
                meta={`${canvas.nodeCount} cards · ${canvas.edgeCount} connections${canvas.description ? ' — ' + canvas.description : ''}`}
                badge={<Badge className="bg-navy-900-5 text-navy-800-72">Private</Badge>}
                actions={
                  <div className="flex items-center gap-2 shrink-0">
                    <Button to={`/student/classes/${classId}/learning/${canvas.id}`}>
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
                        onClick={() => setRenameTarget(canvas)}
                      >
                        <Edit2 size={16} aria-hidden="true" />
                        <span>Rename</span>
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
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateLearningCanvasDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreatePersonal}
      />

      {renameTarget && (
        <RenameLearningCanvasDialog
          open={Boolean(renameTarget)}
          onClose={() => setRenameTarget(null)}
          initialTitle={renameTarget.title}
          onRename={handleRenamePersonal}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete personal canvas?"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel={deleteBusy ? 'Deleting…' : 'Delete canvas'}
        onConfirm={handleDeletePersonal}
      />

      {importResult && (
        <LossyImportDialog
          open={Boolean(importResult)}
          onClose={() => setImportResult(null)}
          importResult={importResult}
          onConfirmNewCanvas={handleConfirmImport}
          mode="catalog"
        />
      )}
    </section>
  )
}
