import { useEffect, useMemo, useState } from 'react'
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
import { draftFromPair, validateQuestionDraft } from '../builder/questionDraft'
import { getQuiz, publishQuiz, unpublishQuiz, watchQuestionPairs, watchQuiz, type QuizRecord, type SavedQuestion } from '../services'
import { describeQuizExperience, hasTeamParticipation } from './quizExperience'
import { QuizWorkflowNav, quizStepPath } from './QuizWorkflowNav'

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
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') setRefreshTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('focus', handleVisible)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('focus', handleVisible)
    }
  }, [])

  useEffect(() => {
    let active = true
    const subscribeQuiz = typeof watchQuiz === 'function'
      ? watchQuiz
      : (id: string, onChange: (q: QuizRecord | null) => void, onError: (e: Error) => void) => {
          getQuiz(id).then(onChange).catch((err) => onError(err instanceof Error ? err : new Error(String(err))))
          return () => {}
        }
    const stopQuiz = subscribeQuiz(
      quizId,
      (found) => {
        if (!active) return
        if (found) setQuiz(found as QuizRecord)
        else setLoadError('This quiz could not be found.')
      },
      (reason) => {
        if (active) setLoadError(reason.message)
      },
    )
    const stopPairs = watchQuestionPairs(
      quizId,
      (questions) => {
        if (!active) return
        setItems(questions)
      },
      () => undefined,
    )
    return () => {
      active = false
      stopQuiz()
      stopPairs()
    }
  }, [quizId, refreshTick])

  useEffect(() => {
    if (!ownerId) return undefined
    return watchMyClasses(ownerId, (next) => { setClasses(next); setClassesLoaded(true) }, () => setClassesLoaded(true))
  }, [ownerId])

  const assignedClass = quiz ? classes.find((item) => item.id === quiz.classId) : undefined
  const activeClass = assignedClass?.status === 'active' ? assignedClass : undefined
  const published = quiz?.status === 'published'
  const isGroupQuiz = quiz ? hasTeamParticipation(quiz.mode, quiz.settings) : false
  const classPath = quiz?.classId ? `/instructor/classes/${quiz.classId}?tab=quizzes` : '/instructor/quizzes'

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
        label: 'Add at least one question.',
        fixTo: quizStepPath(quizId, 'questions'),
        fixLabel: 'Add questions',
      })
    } else {
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
  }, [quiz, published, quizId, classesLoaded, activeClass, items])

  async function publishNow() {
    if (!quiz || problems.length > 0) return
    setBusy(true)
    try {
      await publishQuiz(quizId)
      showToast('success', 'Quiz published and ready for students.')
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
      showToast('success', 'Quiz returned to draft.')
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'This quiz could not be unpublished.')
    } finally {
      setBusy(false)
    }
  }

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
              {describeQuizExperience({ mode: quiz.mode, title: quiz.title, settings: quiz.settings })}
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
                : <Button type="button" disabled={busy || problems.length > 0 || !classesLoaded} onClick={() => void publishNow()}>{busy ? 'Publishing…' : 'Publish quiz'}</Button>}
            </div>
          </SectionCard>
        )}

        <h2 className="mt-4">Student preview</h2>
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
      </main>
    </AppShell>
  )
}
