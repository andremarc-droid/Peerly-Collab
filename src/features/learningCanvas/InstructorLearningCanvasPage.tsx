import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import type { Timestamp } from 'firebase/firestore'
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
  saveCanvas,
  publish,
  unpublish,
  watchClassCanvases,
} from './services'
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

  const [canvas, setCanvas] = useState<LearningCanvasRecord | null>(null)
  const [content, setContent] = useState<LearningCanvasContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moduleRefs, setModuleRefs] = useState<ResolvedReferenceInfo[]>([])
  const [quizRefs, setQuizRefs] = useState<ResolvedReferenceInfo[]>([])
  const [canvasRefs, setCanvasRefs] = useState<ResolvedReferenceInfo[]>([])

  const [className, setClassName] = useState<string>('Classroom')

  // The updatedAt token of the version this editor is based on. Set on load,
  // advanced only by our own saves or an explicit reload / overwrite. It must
  // not follow the live metadata listener (that would hide other sessions' edits).
  const expectedUpdatedAtRef = useRef<Timestamp | null>(null)

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
      expectedUpdatedAtRef.current = meta?.updatedAt ?? null
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
    options?: { force?: boolean },
  ) => {
    if (!classId || !canvasId) throw new Error('Canvas is not ready to save.')
    if (options?.force || !expectedUpdatedAtRef.current) {
      const latest = await getCanvas(classId, canvasId)
      if (!latest) throw new Error('Canvas not found.')
      expectedUpdatedAtRef.current = latest.updatedAt
    }
    const expected = expectedUpdatedAtRef.current
    if (!expected) throw new Error('Canvas is not ready to save.')
    const savedAt = await saveCanvas(classId, canvasId, updatedContent, expected)
    if (savedAt) expectedUpdatedAtRef.current = savedAt
  }

  const handleReloadLatest = async () => {
    if (!classId || !canvasId) return undefined
    const [latestContent, meta] = await Promise.all([
      getContent(classId, canvasId),
      getCanvas(classId, canvasId),
    ])
    if (meta) expectedUpdatedAtRef.current = meta.updatedAt
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
      const latest = await getCanvas(classId, canvasId)
      if (latest) expectedUpdatedAtRef.current = latest.updatedAt
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
            readOnly={false}
            canEditStatus={true}
            status={canvas?.status === 'published' ? 'published' : 'draft'}
            availableReferences={availableRefs}
            onSave={handleSave}
            onToggleStatus={handleToggleStatus}
            onReloadLatest={handleReloadLatest}
            onOpenReference={handleOpenReference}
          />
        </div>
      </main>
    </AppShell>
  )
}
