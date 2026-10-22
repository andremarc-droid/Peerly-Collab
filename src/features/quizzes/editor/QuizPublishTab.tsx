import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { useToast } from '../../../shared/ui/useToast'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import { ExpandableCanvasContainer } from '../../canvas/components/ExpandableCanvasContainer'
import { toDataUrl } from '../../canvas/imageProcessing'
import { listImages } from '../../canvas/imageService'
import type { CanvasQuestion } from '../../canvas/types'
import { draftFromPair, validateQuestionDraft } from '../builder/questionDraft'
import { getQuiz, publishQuiz, unpublishQuiz, watchQuestionPairs, type QuizRecord, type SavedQuestion } from '../services'
import { describeQuizExperience, hasTeamParticipation } from './quizExperience'
import { QuizWorkflowNav, quizStepPath } from './QuizWorkflowNav'

const CanvasBoard = lazy(() => import('../../canvas/components/CanvasBoard'))

interface PublishProblem {
  label: string
  fixTo: string
  fixLabel: string
}

/**
 * Step 3 of making a quiz: see what students will see, confirm it is ready, and publish.
 * This is the only place the normal flow publishes from, so the instructor never has to hunt for it.
 */
export function QuizPublishTab({ quizId }: { quizId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerId = user?.uid
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [items, setItems] = useState<SavedQuestion[]>([])
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canvasImages, setCanvasImages] = useState<Record<string, { dataUrl: string; alt?: string }>>({})
  const [canvasImagesError, setCanvasImagesError] = useState(false)

  const loadCanvasImages = useCallback(async () => {
    if (!quizId) return
    setCanvasImagesError(false)
    try {
      const imgList = await listImages(quizId)
      const rec: Record<string, { dataUrl: string; alt?: string }> = {}
      imgList.forEach((img) => {
        rec[img.id] = { dataUrl: toDataUrl(img.mimeType, img.data) }
      })
      setCanvasImages(rec)
    } catch {
      setCanvasImagesError(true)
    }
  }, [quizId])

  useEffect(() => {
    let active = true
    getQuiz(quizId)
      .then((found) => {
        if (!active) return
        if (found) setQuiz(found)
        else setLoadError('This quiz could not be found.')
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : 'This quiz could not be loaded.')
      })
    const stop = watchQuestionPairs(
      quizId,
      (questions) => {
        if (!active) return
        setItems(questions)
        const cq = questions.find((item) => item.question.type === 'canvas')?.question as CanvasQuestion | undefined
        if (cq?.cards?.some((c) => c.type === 'image' && c.imageId)) {
          void loadCanvasImages()
        }
      },
      () => undefined,
    )
    return () => { active = false; stop() }
  }, [quizId, loadCanvasImages])

  useEffect(() => {
    if (!ownerId) return undefined
    return watchMyClasses(ownerId, (next) => { setClasses(next); setClassesLoaded(true) }, () => setClassesLoaded(true))
  }, [ownerId])

  const assignedClass = quiz ? classes.find((item) => item.id === quiz.classId) : undefined
  const activeClass = assignedClass?.status === 'active' ? assignedClass : undefined
  const published = quiz?.status === 'published'
  const isCanvas = quiz?.mode === 'canvas'
  const isGroupQuiz = quiz ? hasTeamParticipation(quiz.mode, quiz.settings) : false
  const classPath = quiz?.classId ? `/instructor/classes/${quiz.classId}?tab=${isCanvas ? 'canvas' : 'quizzes'}` : '/instructor/quizzes'

  const problems = useMemo<PublishProblem[]>(() => {
    if (!quiz || published) return []
    const found: PublishProblem[] = []
    if (!quiz.title.trim()) {
      found.push({ label: 'Give this quiz a title.', fixTo: quizStepPath(quizId, 'settings'), fixLabel: 'Open settings' })
    }
    if (classesLoaded && !activeClass) {
      found.push({ label: 'Assign this quiz to one of your active classes.', fixTo: quizStepPath(quizId, 'settings'), fixLabel: 'Open settings' })
    }
    if (items.length < 1) {
      found.push({
        label: isCanvas ? 'Save your canvas board.' : 'Add at least one question.',
        fixTo: quizStepPath(quizId, 'questions'),
        fixLabel: isCanvas ? 'Open the board' : 'Add questions',
      })
    } else if (!isCanvas) {
      const needAttention = items.filter(({ question, answerKey }) => !answerKey || Object.keys(validateQuestionDraft(draftFromPair(question, answerKey), quiz.mode)).length > 0).length
      if (needAttention > 0) {
        found.push({
          label: `${needAttention} ${needAttention === 1 ? 'question needs' : 'questions need'} attention before students can take this.`,
          fixTo: quizStepPath(quizId, 'questions'),
          fixLabel: 'Fix questions',
        })
      }
    }
    return found
  }, [quiz, published, quizId, classesLoaded, activeClass, items, isCanvas])

  async function publishNow() {
    if (!quiz || problems.length > 0) return
    setBusy(true)
    try {
      await publishQuiz(quizId)
      showToast('success', isCanvas ? 'Canvas published and ready for students.' : 'Quiz published and ready for students.')
      navigate(classPath)
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'This quiz could not be published.')
    } finally {
      setBusy(false)
    }
  }

  async function unpublishNow() {
    if (!quiz) return
    setBusy(true)
    try {
      await unpublishQuiz(quizId)
      setQuiz({ ...quiz, status: 'draft', publishedAt: null })
      showToast('success', isCanvas ? 'Canvas returned to draft.' : 'Quiz returned to draft.')
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'This quiz could not be unpublished.')
    } finally {
      setBusy(false)
    }
  }

  const canvasQuestion = items.find((item) => item.question.type === 'canvas')?.question as CanvasQuestion | undefined
  const title = quiz?.title || 'Quiz preview'

  return (
    <AppShell>
      <PageHeader
        eyebrow="PREVIEW & PUBLISH"
        title={title}
        subtitle="Check what students will see, then publish it to your class."
      />
      <main className="app-shell__content quiz-editor" id="main-content">
        <QuizWorkflowNav quizId={quizId} current="publish" hasTeams={isGroupQuiz} />
        {loadError && <Alert tone="error" label="Quiz not available">{loadError}</Alert>}
        {quiz && (
          <SectionCard
            title={published ? 'This quiz is published' : 'Ready to publish?'}
            description={published
              ? `Students in ${assignedClass?.name ?? 'the assigned class'} can open it now.`
              : activeClass
                ? `It will be published to ${activeClass.name}.`
                : 'Choose the class it belongs to in Settings.'}
          >
            <p className="quiz-experience-summary" aria-live="polite">
              {describeQuizExperience({ mode: quiz.mode, boardKind: quiz.boardKind, title: quiz.title, settings: quiz.settings })}
            </p>
            {problems.length > 0 && (
              <ul className="question-checklist" aria-label="Before you publish">
                {problems.map((problem) => (
                  <li key={problem.label}>
                    <span aria-hidden="true">○</span>
                    <span>{problem.label}</span>
                    <Button to={problem.fixTo} variant="secondary">{problem.fixLabel}</Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {published
                ? (
                  <>
                    <Button to={classPath}>Back to class</Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void unpublishNow()}>{busy ? 'Working…' : 'Unpublish'}</Button>
                  </>
                )
                : <Button type="button" disabled={busy || problems.length > 0 || !classesLoaded} onClick={() => void publishNow()}>{busy ? 'Publishing…' : isCanvas ? 'Publish canvas' : 'Publish quiz'}</Button>}
            </div>
          </SectionCard>
        )}

        <h2 className="mt-4">Student preview</h2>
        {isCanvas ? (
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-navy-800-72">{canvasQuestion?.prompt || 'Connect the cards according to the activity instructions.'}</p>
            <ExpandableCanvasContainer title="Canvas preview">
              <div className="w-full h-full rounded-2xl border border-navy-900-12 overflow-hidden bg-navy-50">
                <Suspense fallback={<div className="quiz-editor-skeleton" aria-label="Loading canvas preview" />}>
                  <CanvasBoard
                    cards={canvasQuestion?.cards ?? []}
                    connections={[]}
                    mode="play"
                    directed={canvasQuestion?.directed ?? true}
                    images={canvasImages}
                    className="w-full h-full"
                  />
                </Suspense>
              </div>
            </ExpandableCanvasContainer>
            {canvasImagesError && (
              <div className="flex items-center gap-2 text-sm text-navy-800 bg-navy-50 border border-navy-900-12 rounded-xl px-3 py-2" role="status">
                <span>Some board images could not be loaded.</span>
                <button
                  type="button"
                  onClick={() => void loadCanvasImages()}
                  className="underline font-medium hover:text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-600 rounded"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p>Students answer {items.length} {items.length === 1 ? 'question' : 'questions'} with answers {items.length ? 'according to the quiz settings' : 'once you add them'}.</p>
            <ol className="grid gap-4">
              {items.map(({ id, question }) => (
                <li key={id} className="rounded-2xl border border-navy-200 p-4">
                  <strong>{question.prompt}</strong>
                  {'options' in question && (
                    <ul>{question.options.map((option) => <li key={option.id}>{option.text}</li>)}</ul>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </AppShell>
  )
}
