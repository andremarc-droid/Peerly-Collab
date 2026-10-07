import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  copyToMyCanvases,
  watchClassCanvases,
  watchMyCanvases,
} from './services'
import { openReferenceInNewTab } from './referenceRoutes'
import { watchClass } from '../classes/services'
import { subscribeToModules } from '../modules/services'
import { watchPublishedQuizzesForClass } from '../classes/services/quizService'
import type {
  LearningCanvasRecord,
  LearningCanvasContent,
  LearningCanvasRefType,
} from './types'
import type { ResolvedReferenceInfo } from './components/ReferenceCard'

export function StudentLearningCanvasPage() {
  const { classId, canvasId } = useParams<{ classId: string; canvasId: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [canvas, setCanvas] = useState<LearningCanvasRecord | null>(null)
  const [content, setContent] = useState<LearningCanvasContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moduleRefs, setModuleRefs] = useState<ResolvedReferenceInfo[]>([])
  const [quizRefs, setQuizRefs] = useState<ResolvedReferenceInfo[]>([])
  const [className, setClassName] = useState<string>('Classroom')

  // The updatedAt token of the version this editor is based on. It is set when
  // the content is loaded and advanced only by our own saves (or an explicit
  // reload / overwrite). It must NOT follow the live metadata listener, or a
  // save by another session would be adopted silently and never detected.
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

  // Watch classroom study materials for references. Each source replaces its
  // own list on every snapshot, so repeated snapshots never duplicate entries.
  useEffect(() => {
    if (!classId || !user) return

    const unsubModules = subscribeToModules(
      classId,
      'student',
      (mods) => {
        setModuleRefs(mods.map((m) => ({ id: m.id, title: m.title, type: 'module', available: true })))
      },
      () => {},
    )

    const unsubQuizzes = watchPublishedQuizzesForClass(
      classId,
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

    return () => {
      unsubModules()
      unsubQuizzes()
    }
  }, [classId, user])

  const availableRefs = useMemo(() => [...moduleRefs, ...quizRefs], [moduleRefs, quizRefs])

  // Watch canvas metadata doc (could be class published or personal)
  useEffect(() => {
    if (!classId || !canvasId || !user) return

    const unsubClass = watchClassCanvases(
      classId,
      'student',
      (items) => {
        const found = items.find((c) => c.id === canvasId)
        if (found) setCanvas(found)
      },
      () => {},
    )

    const unsubPersonal = watchMyCanvases(
      classId,
      user.uid,
      (items) => {
        const found = items.find((c) => c.id === canvasId)
        if (found) setCanvas(found)
      },
      () => {}
    )

    return () => {
      unsubClass()
      unsubPersonal()
    }
  }, [classId, canvasId, user])

  // Load content together with the version token it belongs to
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
      setError(err instanceof Error ? err.message : 'Failed to load study canvas.')
      setLoading(false)
    }
  }, [classId, canvasId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const isReadOnly = canvas ? canvas.kind === 'class' : true

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
    openReferenceInNewTab('student', classId, refType, refId)
  }

  const handleCopyToMyCanvases = async () => {
    if (!classId || !canvasId || !user) return
    try {
      const copyId = await copyToMyCanvases(classId, canvasId, user.uid)
      showToast('success', 'Board copied to your personal canvases!')
      navigate(`/student/classes/${classId}/learning/${copyId}`)
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to copy canvas.')
    }
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader eyebrow="STUDY CANVAS" title="Loading board…" subtitle="Please wait" />
        <main className="app-shell__content">
          <Skeleton className="h-[600px] rounded-3xl" label="Loading study canvas" />
        </main>
      </AppShell>
    )
  }

  if (error || !content) {
    return (
      <AppShell>
        <PageHeader eyebrow="STUDY CANVAS" title="Board unavailable" subtitle="We couldn’t open this board." />
        <main className="app-shell__content grid gap-4">
          <Alert tone="error" label="Failed to load study canvas" action={<Button onClick={() => void loadData()}>Retry</Button>}>
            {error || 'This canvas may have been removed or you may not have access.'}
          </Alert>
          <Button to="/student/learning" variant="secondary">
            Back to Learning
          </Button>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${className} / ${isReadOnly ? 'CLASS STUDY CANVAS' : 'MY STUDY CANVAS'}`}
        title={canvas?.title || 'Study Canvas'}
        subtitle={canvas?.description || 'Visual study board and concept map.'}
        action={<Button to="/student/learning" variant="secondary">Back to Learning</Button>}
      />
      <main className="app-shell__content flex flex-col gap-4">
        <div className="w-full">
          <LearningCanvas
            title={canvas?.title}
            initialContent={content}
            readOnly={isReadOnly}
            canEditStatus={false}
            availableReferences={availableRefs}
            onSave={isReadOnly ? undefined : handleSave}
            onCopyToMyCanvases={isReadOnly ? handleCopyToMyCanvases : undefined}
            onReloadLatest={handleReloadLatest}
            onOpenReference={handleOpenReference}
          />
        </div>
      </main>
    </AppShell>
  )
}
