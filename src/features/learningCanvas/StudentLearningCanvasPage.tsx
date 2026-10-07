import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  copyToMyCanvases,
  watchClassCanvases,
  watchMyCanvases,
} from './services'
import { watchClass } from '../classes/services'
import { subscribeToModules } from '../modules/services'
import { watchPublishedQuizzesForClass } from '../classes/services/quizService'
import type {
  LearningCanvasRecord,
  LearningCanvasContent,
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

  // Watch classroom study materials for references
  useEffect(() => {
    if (!classId || !user) return

    const refs: ResolvedReferenceInfo[] = []

    const unsubModules = subscribeToModules(
      classId,
      'student',
      (mods) => {
        mods.forEach((m) => {
          refs.push({ id: m.id, title: m.title, type: 'module', available: true })
        })
        setAvailableRefs([...refs])
      },
      () => {},
    )

    const unsubQuizzes = watchPublishedQuizzesForClass(
      classId,
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

    return () => {
      unsubModules()
      unsubQuizzes()
    }
  }, [classId, user])

  // Watch canvas metadata doc (could be class published or personal)
  useEffect(() => {
    if (!classId || !canvasId || !user) return

    let unsubClass: (() => void) | undefined
    let unsubPersonal: (() => void) | undefined

    unsubClass = watchClassCanvases(
      classId,
      'student',
      (items) => {
        const found = items.find((c) => c.id === canvasId)
        if (found) setCanvas(found)
      },
      () => {},
    )

    unsubPersonal = watchMyCanvases(
      classId,
      user.uid,
      (items) => {
        const found = items.find((c) => c.id === canvasId)
        if (found) setCanvas(found)
      },
      () => {}
    )

    return () => {
      unsubClass?.()
      unsubPersonal?.()
    }
  }, [classId, canvasId, user])

  // Load content
  const loadData = useCallback(async () => {
    if (!classId || !canvasId) return
    setLoading(true)
    setError(null)
    try {
      const initialContent = await getContent(classId, canvasId)
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

  const handleSave = async (updatedContent: LearningCanvasContent) => {
    if (!classId || !canvasId || !canvas || isReadOnly) return
    await saveCanvas(classId, canvasId, updatedContent, canvas.updatedAt)
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
          <Button to={`/student/classes/${classId}`} variant="secondary">
            Back to Class
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
