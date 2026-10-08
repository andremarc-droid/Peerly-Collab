import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  Share2,
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
  getCanvas,
  saveCanvas,
} from './services'
import { toJsonCanvas, fromJsonCanvas, type FromJsonCanvasResult } from './jsonCanvas'
import { CreateLearningCanvasDialog } from './components/CreateLearningCanvasDialog'
import { RenameLearningCanvasDialog } from './components/RenameLearningCanvasDialog'
import { LossyImportDialog } from './components/LossyImportDialog'
import { LearningGraphView } from './components/LearningGraphView'
import { NotesTabContent } from './components/NotesTabContent'
import { FlashcardsTab, useFlashcardDecks } from '../flashcards'
import { ChatbotTab, TutorDock } from '../chatbot'
import { useSharedCanvases } from './collab/useSharedCanvases'
import { SharedCanvasList } from './collab/SharedCanvasList'
import { logActivity } from './collab/activityService'
import { loadNoteContent, saveNote } from './noteService'
import { NOTE_CONTENT_MAX, NOTE_NODE_ID, noteDescription } from './noteContent'
import { LearningInviteCodeInput } from '../learningSharing/LearningInviteCodeInput'

export function InstructorLearningHubPage() {
  const { user } = useAuth()
  const sharedCanvases = useSharedCanvases(user?.uid)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [classesError, setClassesError] = useState<string | null>(null)

  const [selectedClassId] = useState<string>(searchParams.get('classId') || 'all')
  const [viewMode, setViewMode] = useState<string>(searchParams.get('tab') === 'notes' ? 'notes' : searchParams.get('tab') === 'graph' || searchParams.has('graphId') ? 'graph' : 'canvases') // 'canvases' | 'graph'

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

  const { decks: flashcardDecks, error: flashcardError } = useFlashcardDecks({
    role: 'instructor',
    uid: user?.uid,
    classIds: classes.map((c) => c.id),
  })

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
    if (!user || !classes.length) return
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
        subscribeToModules(
          cls.id,
          'instructor',
          (mods) => {
            setModuleTitles((prev) => {
              const next = { ...prev }
              mods.forEach((m) => {
                next[m.id] = m.title
              })
              return next
            })
          },
          () => {},
        ),
      )

      // Quizzes
      unsubs.push(
        watchQuizzesForClass(
          cls.id,
          user.uid,
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
  }, [classes, user])

  // Aggregate all loaded canvases
  const allCanvases = Object.values(canvasMap).flat()
  const graphCanvases = [...allCanvases, ...sharedCanvases.items]
  const classCanvases =
    selectedClassId === 'all'
      ? allCanvases
      : canvasMap[selectedClassId] || []

  // Separate pure whiteboard canvases and concept notes
  const displayCanvases = classCanvases.filter((c) => c.sourceCanvasId !== 'note')
  const displayNotes = [
    ...classCanvases.filter((c) => c.sourceCanvasId === 'note'),
    ...sharedCanvases.items.filter((item) =>
      item.sourceCanvasId === 'note' && (selectedClassId === 'all' || item.classId === selectedClassId),
    ),
  ]

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

  const handleCreateNote = async ({
    classId: targetClass,
    title,
    content,
  }: {
    classId: string
    title: string
    content: string
  }): Promise<string | undefined> => {
    if (!user) return undefined
    const initialNodes = [
      {
        id: NOTE_NODE_ID,
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 380,
        height: 240,
        color: 'none' as const,
        text: content.slice(0, NOTE_CONTENT_MAX),
      },
    ]
    const newId = await createCanvas(targetClass, user.uid, {
      kind: 'class',
      title,
      description: noteDescription(content),
      sourceCanvasId: 'note',
      initialContent: { nodes: initialNodes },
    })
    showToast('success', `Concept note "${title}" added to graph.`)
    return newId
  }

  const handleCreateCanvasInGraph = async ({
    classId: targetClass,
    title,
    description,
  }: {
    classId: string
    title: string
    description: string
  }): Promise<string | undefined> => {
    if (!user) return undefined
    const classToUse = targetClass || activeTargetClassId
    if (!classToUse) {
      showToast('error', 'Please select or create a class first.')
      return undefined
    }
    const newId = await createCanvas(classToUse, user.uid, {
      kind: 'class',
      title,
      description,
    })
    showToast('success', `Learning canvas "${title}" created.`)
    return newId
  }

  /** One save for title + content, shared by the Notes tab and the graph inspector. */
  const handleUpdateNote = async (
    noteId: string,
    targetClass: string,
    input: { title: string; content: string },
  ) => {
    if (!user) return
    const { titleChanged } = await saveNote(targetClass, noteId, input)
    showToast('success', 'Note saved.')
    try {
      await logActivity(targetClass, noteId, {
        uid: user.uid,
        name: user.displayName || user.email || 'Learner',
      }, {
        type: 'edit',
        summary: `Updated note “${input.title.trim()}”`,
        changes: titleChanged
          ? [`Title: ${input.title.trim()}`, 'Updated note content']
          : ['Updated note content'],
      })
    } catch {
      showToast('error', 'The note was saved, but its activity could not be recorded.')
    }
  }

  const handleLoadNote = (noteId: string, targetClass: string) =>
    loadNoteContent(targetClass, noteId)

  const handleDeleteNoteFromTab = async (note: LearningCanvasWithId) => {
    await deleteCanvas(note.classId, note.id)
    showToast('success', `Note "${note.title}" deleted.`)
  }

  const handleConnectNodes = async (
    sourceId: string,
    targetId: string,
    targetClass: string,
  ) => {
    if (!user) return
    const [sourceType, sourceRawId] = sourceId.split(':')
    const [targetType, targetRawId] = targetId.split(':')

    if (sourceType !== 'learning' && sourceType !== 'note') {
      showToast('error', 'Links can only be created from a Note or Canvas.')
      return
    }

    const [existingMeta, existingContent] = await Promise.all([
      getCanvas(targetClass, sourceRawId),
      getContent(targetClass, sourceRawId),
    ])
    if (!existingMeta || !existingContent) return

    const refType = (targetType === 'note' ? 'learning' : targetType) as
      | 'module'
      | 'quiz'
      | 'learning'

    const alreadyRef = existingContent.nodes.some(
      (n) =>
        n.type === 'reference' &&
        n.reference.refType === refType &&
        n.reference.refId === targetRawId,
    )

    if (!alreadyRef) {
      existingContent.nodes.push({
        id: `ref-${Date.now()}`,
        type: 'reference',
        x: 200,
        y: 100,
        width: 240,
        height: 140,
        color: 'none',
        reference: { refType, refId: targetRawId },
      })
      await saveCanvas(targetClass, sourceRawId, existingContent, existingMeta.updatedAt)
      showToast('success', 'Link created in knowledge graph.')
    }
  }

  const handleDisconnectNodes = async (
    sourceId: string,
    targetId: string,
    targetClass: string,
  ) => {
    if (!user) return
    const [, sourceRawId] = sourceId.split(':')
    const [, targetRawId] = targetId.split(':')

    const [existingMeta, existingContent] = await Promise.all([
      getCanvas(targetClass, sourceRawId),
      getContent(targetClass, sourceRawId),
    ])
    if (!existingMeta || !existingContent) return

    const prevLength = existingContent.nodes.length
    existingContent.nodes = existingContent.nodes.filter(
      (n) => !(n.type === 'reference' && n.reference.refId === targetRawId),
    )

    if (existingContent.nodes.length < prevLength) {
      await saveCanvas(targetClass, sourceRawId, existingContent, existingMeta.updatedAt)
      showToast('success', 'Link removed.')
    }
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
  const selectedClassName = selectedClassId === 'all' ? undefined : classNameMap.get(selectedClassId)

  return (
    <AppShell>
      <PageHeader
        eyebrow="STUDY & KNOWLEDGE"
        title="Learning"
        subtitle="Visual concept canvases and interactive knowledge graph."
        action={
          <div className="learning-header-actions flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={classes.length === 0}
          >
            <Upload size={16} aria-hidden="true" />
            <span>Import .canvas</span>
          </Button>
          <LearningInviteCodeInput />
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
        <div className="learning-toolbar flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-3xl border border-navy-900-15 shadow-xs">
          <SegmentedControl
            label="Learning view mode"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { label: 'Canvases', value: 'canvases' },
              { label: 'Notes', value: 'notes' },
              { label: 'Flashcards', value: 'flashcards' },
              { label: 'Graph view', value: 'graph' },
            ]}
          />
        </div>

        <p className="learning-canvas-count m-0 text-sm font-semibold text-navy-800-72" role="status">
          {displayCanvases.length} {displayCanvases.length === 1 ? 'canvas' : 'canvases'} created
        </p>

        {/* View mode 1: Graph View */}
        {viewMode === 'graph' && (
          <section aria-label="Learning knowledge graph">
            <LearningGraphView
              canvases={graphCanvases}
              classes={classOptions}
              moduleTitles={moduleTitles}
              quizTitles={quizTitles}
              selectedClassId={selectedClassId}
              role="instructor"
              onSwitchToCanvases={() => setViewMode('canvases')}
              onCreateNote={handleCreateNote}
              onCreateCanvas={handleCreateCanvasInGraph}
              onUpdateNote={handleUpdateNote}
              onLoadNoteContent={handleLoadNote}
              onConnectNodes={handleConnectNodes}
              onDisconnectNodes={handleDisconnectNodes}
            />
          </section>
        )}

        {/* AI Tutor: floating button on every tab. Always mounted so a reply in progress survives tab switches. */}
        {/* Shared-conversation links (?tab=tutor&thread=…) open it straight away. */}
        <TutorDock defaultOpen={searchParams.get('tab') === 'tutor' || searchParams.has('thread')}>
          <ChatbotTab classLabel={selectedClassName} compact />
        </TutorDock>

        {/* View mode: Flashcards */}
        {viewMode === 'flashcards' && (
          <section aria-label="Flashcard decks">
            <FlashcardsTab
              decks={flashcardDecks}
              classes={classOptions}
              selectedClassId={selectedClassId}
              role="instructor"
              error={flashcardError}
            />
          </section>
        )}

        {/* View mode: Notes List */}
        {viewMode === 'notes' && (
          <section aria-label="Concept notes">
            <NotesTabContent
              notes={displayNotes}
              sharedError={sharedCanvases.error}
              classes={classOptions}
              selectedClassId={selectedClassId}
              role="instructor"
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNoteFromTab}
              onViewInGraph={(_noteId) => setViewMode('graph')}
            />
          </section>
        )}

        {/* View mode 2: Canvases List */}
        {viewMode === 'canvases' && (
          <section aria-labelledby="learning-canvases-heading" className="grid gap-4">
            <SharedCanvasList
              items={sharedCanvases.items}
              error={sharedCanvases.error}
              role="instructor"
              selectedClassId={selectedClassId}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm">
              <h2 id="learning-canvases-heading" className="text-xl font-bold text-navy-900 m-0">
                Study Canvases
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-navy-800">
                  {displayCanvases.length} {displayCanvases.length === 1 ? 'canvas' : 'canvases'}
                </span>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setCreateOpen(true)}
                  disabled={classes.length === 0}
                >
                  <Plus size={16} aria-hidden="true" />
                  <span>New Canvas</span>
                </Button>
              </div>
            </div>

            {listStatus === 'loading' && (
              <div className="grid gap-3" aria-label="Loading canvases">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            )}

            {listStatus === 'error' && (
              <Alert tone="error" label="Could not load learning canvases">
                {classesError || 'Unable to load canvases right now.'}
              </Alert>
            )}

            {listStatus === 'empty' && (
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

            {listStatus === 'ready' && (
              <div className="grid gap-3" role="list" aria-label="Canvases list">
                {displayCanvases.map((canvas) => {
                  const editHref = `/instructor/classes/${canvas.classId}/learning/${canvas.id}`
                  const className = classNameMap.get(canvas.classId) || 'Class'
                  const statusLabel = canvas.status === 'published' ? 'Published' : 'Draft'
                  const metaText = `${className} · ${statusLabel} · ${canvas.nodeCount} cards · ${canvas.edgeCount} connections · ${canvas.description || 'No description provided.'}`

                  return (
                    <DataCard
                      key={canvas.id}
                      title={canvas.title}
                      meta={metaText}
                      badge={<Badge>{className}</Badge>}
                      actions={
                        <div className="flex flex-wrap items-center gap-2">
                          <Button to={editHref} variant="secondary">
                            Open canvas
                          </Button>
                          <Button to={`${editHref}#canvas-collaboration`} variant="secondary" aria-label={`Share ${canvas.title}`}>
                            <Share2 size={16} aria-hidden="true" />
                            <span>Share</span>
                          </Button>
                          <DropdownMenu
                            label={`Actions for ${canvas.title}`}
                            iconOnly
                            trigger={<MoreVertical size={20} aria-hidden="true" />}
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
        {/* Keeps the last items clear of the floating AI Tutor button. */}
        <div className="h-14" aria-hidden="true" />
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
          initialTitle={renameTarget.title}
          initialDescription={renameTarget.description}
          onClose={() => setRenameTarget(null)}
          onRename={async (title) => {
            await handleRename(title)
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Delete learning canvas?"
          description={`Are you sure you want to delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete canvas"
          busy={deleteBusy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {importResult && (
        <LossyImportDialog
          open={Boolean(importResult)}
          importResult={importResult}
          mode="catalog"
          onClose={() => setImportResult(null)}
          onConfirmNewCanvas={() => void handleConfirmImport()}
        />
      )}
    </AppShell>
  )
}
