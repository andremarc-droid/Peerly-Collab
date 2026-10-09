import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  Edit2,
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
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import { listMyEnrollments } from '../classes/services/joinService'
import { watchClass } from '../classes/services/classService'
import { subscribeToModules } from '../modules/services'
import { watchPublishedQuizzesForClass } from '../classes/services/quizService'
import type { ClassWithId, EnrollmentWithId } from '../classes/types'
import type { LearningCanvasWithId } from './types'
import {
  watchClassCanvases,
  watchMyCanvases,
  createCanvas,
  deleteCanvas,
  copyToMyCanvases,
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

export function StudentLearningHubPage() {
  const { user } = useAuth()
  const sharedCanvases = useSharedCanvases(user?.uid)
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [classesMap, setClassesMap] = useState<Record<string, ClassWithId>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedClassId] = useState<string>(searchParams.get('classId') || 'all')
  const personalWorkspaceId = user?.uid
  const workspaceClassIds = [...new Set([
    ...enrollments.map((enrollment) => enrollment.classId),
    ...(personalWorkspaceId ? [personalWorkspaceId] : []),
  ])]
  const workspaceClassKey = workspaceClassIds.join('|')
  const [viewMode, setViewMode] = useState<string>(searchParams.get('tab') === 'notes' ? 'notes' : searchParams.get('tab') === 'graph' || searchParams.has('graphId') ? 'graph' : 'canvases') // 'canvases' | 'graph'

  // Per-class canvases: classId -> LearningCanvasWithId[]
  const [instructorCanvasesMap, setInstructorCanvasesMap] = useState<Record<string, LearningCanvasWithId[]>>({})
  const [personalCanvasesMap, setPersonalCanvasesMap] = useState<Record<string, LearningCanvasWithId[]>>({})
  const [moduleTitles, setModuleTitles] = useState<Record<string, string>>({})
  const [quizTitles, setQuizTitles] = useState<Record<string, string>>({})

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LearningCanvasWithId | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [importResult, setImportResult] = useState<FromJsonCanvasResult | null>(null)
  const [importedTitle, setImportedTitle] = useState('Imported Study Board')

  const { decks: flashcardDecks, error: flashcardError } = useFlashcardDecks({
    role: 'student',
    uid: user?.uid,
    classIds: workspaceClassIds,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // 1. Fetch student enrollments
  useEffect(() => {
    if (!user) return
    setLoading(true)
    const unsub = listMyEnrollments(
      user.uid,
      (items) => {
        setEnrollments(items.filter((e) => e.status === 'active'))
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [user])

  // 2. Watch classes, published canvases, personal canvases, modules & quizzes
  useEffect(() => {
    if (!user || !workspaceClassKey) return
    const unsubs: Array<() => void> = []

    workspaceClassKey.split('|').forEach((classId) => {
      const isPersonalWorkspace = classId === user.uid && !enrollments.some((e) => e.classId === classId)

      if (isPersonalWorkspace) {
        unsubs.push(watchMyCanvases(classId, user.uid, (items) => {
          setPersonalCanvasesMap((prev) => ({ ...prev, [classId]: items }))
        }, () => {}))
        return
      }

      // Class info
      unsubs.push(
        watchClass(
          classId,
          (cls) => {
            if (cls) setClassesMap((prev) => ({ ...prev, [classId]: cls }))
          },
          () => {},
        ),
      )

      // Instructor's published canvases
      unsubs.push(
        watchClassCanvases(
          classId,
          'student',
          (items) => {
            setInstructorCanvasesMap((prev) => ({ ...prev, [classId]: items }))
          },
          () => {},
        ),
      )

      // My personal study canvases
      unsubs.push(
        watchMyCanvases(
          classId,
          user.uid,
          (items) => {
            setPersonalCanvasesMap((prev) => ({ ...prev, [classId]: items }))
          },
          () => {},
        ),
      )

      // Modules
      unsubs.push(
        subscribeToModules(
          classId,
          'student',
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
        watchPublishedQuizzesForClass(
          classId,
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
  }, [user, enrollments, workspaceClassKey])

  // Aggregate canvases
  const allInstructorCanvases = Object.values(instructorCanvasesMap).flat()
  const allPersonalCanvases = Object.values(personalCanvasesMap).flat()
  const combinedCanvases = [...allInstructorCanvases, ...allPersonalCanvases, ...sharedCanvases.items]

  const instructorList =
    selectedClassId === 'all'
      ? allInstructorCanvases
      : instructorCanvasesMap[selectedClassId] || []

  const personalList =
    selectedClassId === 'all'
      ? allPersonalCanvases
      : personalCanvasesMap[selectedClassId] || []

  const displayInstructorCanvases = instructorList.filter((c) => c.sourceCanvasId !== 'note')
  const displayPersonalCanvases = personalList.filter((c) => c.sourceCanvasId !== 'note')
  const displayPersonalNotes = [
    ...personalList.filter((c) => c.sourceCanvasId === 'note'),
    ...sharedCanvases.items.filter((item) =>
      item.sourceCanvasId === 'note' && (selectedClassId === 'all' || item.classId === selectedClassId),
    ),
  ]

  const enrolledClasses = enrollments
    .map((e) => classesMap[e.classId])
    .filter((c): c is ClassWithId => Boolean(c))

  const classOptions = [
    ...(user ? [{ id: user.uid, name: 'Personal workspace' }] : []),
    ...enrolledClasses.map((c) => ({ id: c.id, name: c.name })),
  ]
  const activeTargetClassId =
    selectedClassId !== 'all' ? selectedClassId : enrolledClasses[0]?.id

  const handleCreate = async (title: string, description: string, targetClassId?: string) => {
    if (!user) return
    const classToUse = targetClassId || activeTargetClassId
    const destination = classToUse || user.uid
    if (!destination) {
      showToast('error', 'Sign in to create a study canvas.')
      return
    }
    const newId = await createCanvas(destination, user.uid, {
      kind: 'personal',
      title,
      description,
    })
    showToast('success', 'Personal study canvas created.')
    navigate(`/student/classes/${destination}/learning/${newId}`)
  }

  const handleCreatePersonalNote = async ({
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
      kind: 'personal',
      title,
      description: noteDescription(content),
      sourceCanvasId: 'note',
      initialContent: { nodes: initialNodes },
    })
    showToast('success', `Study note "${title}" added to graph.`)
    return newId
  }

  const handleCreatePersonalCanvasInGraph = async ({
    classId: targetClass,
    title,
    description,
  }: {
    classId: string
    title: string
    description: string
  }): Promise<string | undefined> => {
    if (!user) return undefined
    const classToUse = targetClass || activeTargetClassId || user.uid
    if (!classToUse) {
      showToast('error', 'Sign in to create a study canvas.')
      return undefined
    }
    const newId = await createCanvas(classToUse, user.uid, {
      kind: 'personal',
      title,
      description,
    })
    showToast('success', `Study canvas "${title}" created.`)
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
      showToast('error', 'Links can only be created from your personal Notes or Canvases.')
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

  const handleCopy = async (canvas: LearningCanvasWithId) => {
    if (!user) return
    try {
      const copyId = await copyToMyCanvases(canvas.classId, canvas.id, user.uid)
      showToast('success', 'Board copied to your personal study canvases.')
      navigate(`/student/classes/${canvas.classId}/learning/${copyId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Copy failed.')
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
      showToast('success', 'Study canvas deleted.')
      setDeleteTarget(null)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleteBusy(false)
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
    const destination = activeTargetClassId || user.uid
    try {
      const newId = await createCanvas(destination, user.uid, {
        kind: 'personal',
        title: importedTitle,
        description: 'Imported from JSON Canvas',
        initialContent: importResult.content,
      })
      setImportResult(null)
      showToast('success', 'Study board imported successfully.')
      navigate(`/student/classes/${destination}/learning/${newId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Import failed.')
    }
  }

  const getClassName = (classId: string) =>
    classId === user?.uid ? 'Personal workspace' : classesMap[classId]?.name || 'Class'
  const selectedClassName = selectedClassId === 'all' ? undefined : classesMap[selectedClassId]?.name

  return (
    <AppShell>
      <PageHeader
        eyebrow="STUDY & KNOWLEDGE"
        title="Learning"
        subtitle="Explore learning resources and create your own visual study canvases."
        action={
          <div className="learning-header-actions flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={!user}
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
          {displayInstructorCanvases.length + displayPersonalCanvases.length}{' '}
          {displayInstructorCanvases.length + displayPersonalCanvases.length === 1 ? 'canvas' : 'canvases'} created
        </p>

        {/* View mode 1: Graph View */}
        {viewMode === 'graph' && (
          <section aria-label="Learning knowledge graph">
            <LearningGraphView
              canvases={combinedCanvases}
              classes={classOptions}
              moduleTitles={moduleTitles}
              quizTitles={quizTitles}
              selectedClassId={selectedClassId}
              role="student"
              onSwitchToCanvases={() => setViewMode('canvases')}
              onCreateNote={handleCreatePersonalNote}
              onCreateCanvas={handleCreatePersonalCanvasInGraph}
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
              role="student"
              error={flashcardError}
            />
          </section>
        )}

        {/* View mode: Notes List */}
        {viewMode === 'notes' && (
          <section aria-label="Personal study notes">
            <NotesTabContent
              notes={displayPersonalNotes}
              sharedError={sharedCanvases.error}
              classes={classOptions}
              selectedClassId={selectedClassId}
              role="student"
              onCreateNote={handleCreatePersonalNote}
              onDeleteNote={handleDeleteNoteFromTab}
              onViewInGraph={(_noteId) => setViewMode('graph')}
            />
          </section>
        )}

        {/* View mode 2: Canvases */}
        {viewMode === 'canvases' && (
          <div className="grid gap-8">
            {loading && (
              <div className="grid gap-3" aria-label="Loading canvases">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            )}

            {error && (
              <Alert tone="error" label="Could not load learning canvases">
                {error}
              </Alert>
            )}

            {!loading && !error && (
              <>
                <SharedCanvasList
                  items={sharedCanvases.items}
                  error={sharedCanvases.error}
                  role="student"
                  selectedClassId={selectedClassId}
                />
                {/* 1. Instructor Published Canvases */}
                <section aria-labelledby="instructor-canvases-heading" className="grid gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="section-kicker">CLASS MATERIALS</span>
                  <h2 id="instructor-canvases-heading" className="text-xl font-bold text-navy-900 m-0">
                    From your instructors
                  </h2>
                </div>
                <span className="text-xs text-navy-800-72">
                  {displayInstructorCanvases.length} {displayInstructorCanvases.length === 1 ? 'board' : 'boards'}
                </span>
              </div>

              {displayInstructorCanvases.length === 0 ? (
                <EmptyState
                  title="No class canvases yet"
                  description="When your instructors publish visual concept canvases, they will show up here."
                />
              ) : (
                <div className="grid gap-3" role="list" aria-label="Instructor canvases list">
                  {displayInstructorCanvases.map((canvas) => {
                    const className = getClassName(canvas.classId)
                    const metaText = `${className} · ${canvas.nodeCount} cards · ${canvas.edgeCount} connections · ${canvas.description || 'No description provided.'}`
                    return (
                      <DataCard
                        key={canvas.id}
                        title={canvas.title}
                        meta={metaText}
                        badge={<Badge>{className}</Badge>}
                        actions={
                          <div className="flex items-center gap-2">
                            <Button
                              to={`/student/classes/${canvas.classId}/learning/${canvas.id}`}
                              variant="secondary"
                            >
                              View board
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void handleCopy(canvas)}
                            >
                              <Copy size={16} aria-hidden="true" />
                              <span>Save copy</span>
                            </Button>
                          </div>
                        }
                      />
                    )
                  })}
                </div>
              )}
            </section>

            {/* 2. My Study Canvases */}
            <section aria-labelledby="my-canvases-heading" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm">
                <div>
                  <span className="section-kicker">PERSONAL WORKSPACE</span>
                  <h2 id="my-canvases-heading" className="text-xl font-bold text-navy-900 m-0">
                    My study canvases
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-navy-800">
                    {displayPersonalCanvases.length} {displayPersonalCanvases.length === 1 ? 'canvas' : 'canvases'}
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setCreateOpen(true)}
                    disabled={!user}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>New Canvas</span>
                  </Button>
                </div>
              </div>

              {displayPersonalCanvases.length === 0 ? (
                <EmptyState
                  title="No personal study canvases"
                  description="Create your own concept maps, study notes, and link cards."
                  action={
                    user ? (
                      <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}>
                        <Plus size={16} aria-hidden="true" />
                        <span>Create first study canvas</span>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid gap-3" role="list" aria-label="Personal study canvases list">
                  {displayPersonalCanvases.map((canvas) => {
                    const editHref = `/student/classes/${canvas.classId}/learning/${canvas.id}`
                    const className = getClassName(canvas.classId)
                    const metaText = `${className} · ${canvas.nodeCount} cards · ${canvas.edgeCount} connections · ${canvas.description || 'No description provided.'}`
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
          </>
        )}
          </div>
        )}
        {/* Keeps the last items clear of the floating AI Tutor button. */}
        <div className="h-14" aria-hidden="true" />
      </main>

      {/* Dialogs */}
      <CreateLearningCanvasDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        isPersonal
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
          title="Delete study canvas?"
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
