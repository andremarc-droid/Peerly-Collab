import { useState, useEffect, useCallback } from 'react'
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
  getContent,
  saveCanvas,
  publish,
  unpublish,
  watchClassCanvases,
} from './services'
import { watchClass } from '../classes/services'
import { subscribeToModules } from '../modules/services'
import { watchQuizzesForClass } from '../classes/services/quizService'
import type {
  LearningCanvasRecord,
  LearningCanvasContent,
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
  const [availableRefs, setAvailableRefs] = useState<ResolvedReferenceInfo[]>([])

  const [className, setClassName] = useState<string>('Classroom')

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

  // Watch available reference materials in this class
  useEffect(() => {
    if (!classId || !user) return

    const refs: ResolvedReferenceInfo[] = []

    const unsubModules = subscribeToModules(
      classId,
      'instructor',
      (mods) => {
        mods.forEach((m) => {
          refs.push({ id: m.id, title: m.title, type: 'module', available: true })
        })
        setAvailableRefs([...refs])
      },
      () => {},
    )

    const unsubQuizzes = watchQuizzesForClass(
      classId,
      user.uid,
      (quizzes) => {
        quizzes.forEach((q) => {
          refs.push({
            id: q.id,
            title: q.title,
            type: 'quiz',
            isCanvasActivity: q.mode === 'canvas',
            available: true,
          })
        })
        setAvailableRefs([...refs])
      },
      () => {},
    )

    const unsubCanvases = watchClassCanvases(
      classId,
      'instructor',
      (canvases) => {
        canvases.forEach((c) => {
          if (c.id !== canvasId) {
            refs.push({ id: c.id, title: c.title, type: 'learning', available: true })
          }
        })
        setAvailableRefs([...refs])
      },
      () => {},
    )

    return () => {
      unsubModules()
      unsubQuizzes()
      unsubCanvases()
    }
  }, [classId, canvasId, user])

  // Load initial canvas metadata and content
  const loadData = useCallback(async () => {
    if (!classId || !canvasId) return
    setLoading(true)
    setError(null)
    try {
      const initialContent = await getContent(classId, canvasId)
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

  const handleSave = async (updatedContent: LearningCanvasContent) => {
    if (!classId || !canvasId || !canvas) return
    await saveCanvas(classId, canvasId, updatedContent, canvas.updatedAt)
  }

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
          <Button to={`/instructor/classes/${classId}?tab=learning`} variant="secondary">
            Back to Learning tab
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
            onReloadLatest={async () => {
              if (classId && canvasId) {
                return getContent(classId, canvasId)
              }
            }}
          />
        </div>
      </main>
    </AppShell>
  )
}
