import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Alert } from '../../shared/ui/Alert'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useAuth } from '../auth/useAuth'
import { LearningCanvas } from './components/LearningCanvas'
import {
  getCanvas,
  getContent,
  watchCanvasContent,
  publish,
  unpublish,
  watchClassCanvases,
} from './services'
import { saveCanvasMerged } from './collab/saveMerged'
import { useCanvasCollab } from './collab/useCanvasCollab'
import { CanvasCollaborationPanel } from './collab/CanvasCollaborationPanel'
import { useActivityRecorder } from './collab/useActivityRecorder'
import { useCanvasAccess } from './collab/useCanvasAccess'
import { openReferenceInNewTab } from './referenceRoutes'
import { watchClass } from '../classes/services'
import { subscribeToModules } from '../modules/services'
import { watchQuizzesForClass } from '../classes/services/quizService'
import type {
  LearningCanvasRecord,
  LearningCanvasContent,
  LearningCanvasRefType,
} from './types'
import type { ResolvedReferenceInfo } from './components/ReferenceCard'

export function InstructorLearningCanvasPage() {
  const { classId, canvasId } = useParams<{ classId: string; canvasId: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canvasAccess = useCanvasAccess(classId, canvasId, user?.uid)

  const [canvas, setCanvas] = useState<LearningCanvasRecord | null>(null)
  const [content, setContent] = useState<LearningCanvasContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moduleRefs, setModuleRefs] = useState<ResolvedReferenceInfo[]>([])
  const [quizRefs, setQuizRefs] = useState<ResolvedReferenceInfo[]>([])
  const [canvasRefs, setCanvasRefs] = useState<ResolvedReferenceInfo[]>([])

  const [className, setClassName] = useState<string>('Classroom')

  const baseContentRef = useRef<LearningCanvasContent | null>(null)
  const displayName = user?.displayName || user?.email || 'Instructor'
  const collab = useCanvasCollab({
    classId: classId ?? '',
    canvasId: canvasId ?? '',
    uid: user?.uid ?? '',
    name: displayName,
    ownerId: canvas?.ownerId ?? '',
    enabled: Boolean(classId && canvasId && user && canvas?.ownerId),
    owner: canvasAccess.access === 'owner',
  })
  const activityRecorder = useActivityRecorder({
    classId: classId ?? '',
    canvasId: canvasId ?? '',
    uid: user?.uid ?? '',
    name: displayName,
    enabled: Boolean(classId && canvasId && user && canvasAccess.social && canvasAccess.canEdit),
  })

  useEffect(() => {
    if (!classId) return
    return watchClass(
      classId,
      (cls) => {
        if (cls) setClassName(cls.name)
      },
      () => {}
    )
  }, [classId])

  // Watch available reference materials in this class. Each source replaces its
  // own list on every snapshot, so repeated snapshots never duplicate entries.
  useEffect(() => {
    if (!classId || !user) return

    const unsubModules = subscribeToModules(
      classId,
      'instructor',
      (mods) => {
        setModuleRefs(mods.map((m) => ({ id: m.id, title: m.title, type: 'module', available: true })))
      },
      () => {},
    )

    const unsubQuizzes = watchQuizzesForClass(
      classId,
      user.uid,
      (quizzes) => {
        setQuizRefs(
          quizzes.map((q) => ({
            id: q.id,
            title: q.title,
            type: 'quiz',
            isCanvasActivity: q.mode === 'canvas',
            available: true,
          })),
        )
      },
      () => {},
    )

    const unsubCanvases = watchClassCanvases(
      classId,
      'instructor',
      (canvases) => {
        setCanvasRefs(
          canvases
            .filter((c) => c.id !== canvasId)
            .map((c) => ({ id: c.id, title: c.title, type: 'learning', available: true })),
        )
      },
      () => {},
    )

    return () => {
      unsubModules()
      unsubQuizzes()
      unsubCanvases()
    }
  }, [classId, canvasId, user])

  const availableRefs = useMemo(
    () => [...moduleRefs, ...quizRefs, ...canvasRefs],
    [moduleRefs, quizRefs, canvasRefs],
  )

  // Load initial canvas content together with the version token it belongs to
  const loadData = useCallback(async () => {
    if (!classId || !canvasId) return
    setLoading(true)
    setError(null)
    try {
      const [initialContent, meta] = await Promise.all([
        getContent(classId, canvasId),
        getCanvas(classId, canvasId),
      ])
      if (!meta) throw new Error('Canvas not found.')
      setCanvas(meta)
      baseContentRef.current = initialContent
      setContent(initialContent)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load canvas.')
      setLoading(false)
    }
  }, [classId, canvasId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!classId || !canvasId) return undefined
    return watchCanvasContent(
      classId,
      canvasId,
      (next) => {
        if (next) {
          setContent(next)
        }
      },
      (cause) => setError(cause.message),
    )
  }, [classId, canvasId])

  useEffect(() => {
    if (loading || window.location.hash !== '#canvas-collaboration') return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('canvas-collaboration')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, canvasId])

  const handleRemoteContentApplied = useCallback((next: LearningCanvasContent) => {
    baseContentRef.current = next
  }, [])

  // Watch canvas metadata doc for status updates
  useEffect(() => {
    if (!classId || !canvasId) return
    const unsub = watchClassCanvases(
      classId,
      'instructor',
      (items) => {
        const found = items.find((c) => c.id === canvasId)
        if (found) setCanvas(found)
      },
      () => {},
    )
    return () => unsub()
  }, [classId, canvasId])

  const handleSave = async (
    updatedContent: LearningCanvasContent,
  ): Promise<LearningCanvasContent> => {
    if (!classId || !canvasId) throw new Error('Canvas is not ready to save.')
    const base = baseContentRef.current ?? updatedContent
    const result = await saveCanvasMerged({
      classId,
      canvasId,
      base,
      local: updatedContent,
      syncNoteDescription: canvasAccess.access === 'owner' && canvas?.sourceCanvasId === 'note',
    })
    baseContentRef.current = result.content
    activityRecorder.recordEdit(base, updatedContent)
    return result.content
  }

  const handleReloadLatest = async () => {
    if (!classId || !canvasId) return undefined
    const [latestContent, meta] = await Promise.all([
      getContent(classId, canvasId),
      getCanvas(classId, canvasId),
    ])
    if (meta && latestContent) {
      setCanvas(meta)
      baseContentRef.current = latestContent
    }
    return latestContent
  }

  const handleOpenReference = (refType: LearningCanvasRefType, refId: string) => {
    if (!classId) return
    openReferenceInNewTab('instructor', classId, refType, refId)
  }

  // Publish / unpublish bump the metadata's updatedAt on the server. Re-read it
  // afterwards so the next content save is not mistaken for a conflict.
  const handleToggleStatus = async () => {
    if (!classId || !canvasId || !canvas) return
    try {
      if (canvas.status === 'published') {
        await unpublish(classId, canvasId)
        showToast('info', 'Canvas moved to draft.')
      } else {
        await publish(classId, canvasId)
        showToast('success', 'Canvas published to class.')
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Status update failed.')
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader eyebrow="LEARNING CANVAS" title="Loading canvas…" subtitle="Please wait" />
        <main className="app-shell__content">
          <Skeleton className="h-[600px] rounded-3xl" label="Loading canvas editor" />
        </main>
      </AppShell>
    )
  }

  if (error || !content) {
    return (
      <AppShell>
        <PageHeader eyebrow="LEARNING CANVAS" title="Canvas unavailable" subtitle="We couldn’t open this board." />
        <main className="app-shell__content grid gap-4">
          <Alert tone="error" label="Failed to load canvas" action={<Button onClick={() => void loadData()}>Retry</Button>}>
            {error || 'The canvas could not be found or you may not have access.'}
          </Alert>
          <Button to="/instructor/learning" variant="secondary">
            Back to Learning
          </Button>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${className} / LEARNING CANVAS`}
        title={canvas?.title || 'Learning Canvas'}
        subtitle={canvas?.description || 'Collaborative spatial study board.'}
        action={<Button to="/instructor/learning" variant="secondary">Back to Learning</Button>}
      />
      <main className="app-shell__content flex flex-col gap-4">
        <div className="w-full">
          <LearningCanvas
            title={canvas?.title}
            initialContent={content}
            readOnly={!canvasAccess.canEdit}
            canEditStatus={canvasAccess.access === 'owner'}
            status={canvas?.status === 'published' ? 'published' : 'draft'}
            availableReferences={availableRefs}
            remoteContent={content}
            remoteCursors={collab.cursors}
            onPublishCursor={collab.publishCursor}
            onRemoteContentApplied={handleRemoteContentApplied}
            onSave={canvasAccess.canEdit ? handleSave : undefined}
            onToggleStatus={canvasAccess.access === 'owner' ? handleToggleStatus : undefined}
            onReloadLatest={handleReloadLatest}
            onOpenReference={handleOpenReference}
          />
        </div>
        {canvasAccess.social && (
        <CanvasCollaborationPanel
          classId={classId ?? ''}
          canvasId={canvasId ?? ''}
          uid={user?.uid ?? ''}
          name={displayName}
          owner={canvasAccess.access === 'owner'}
          people={collab.people}
          members={collab.members}
          invites={collab.invites}
          activity={collab.activity}
          error={collab.error || activityRecorder.error}
        />
        )}
      </main>
    </AppShell>
  )
}
