import { useEffect, useRef, useState } from 'react'
import { DoorOpen } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { getClassCodePreview, leaveClass, listMyEnrollments } from './services/joinService'
import { quizModeLabel } from '../quizzes/types'
import { watchClass } from './services/classService'
import { watchPublishedQuizzesForClass } from './services/quizService'
import { ClassInitialBadge } from './ClassInitialBadge'
import type { ClassCodeRecord, ClassWithId, EnrollmentWithId } from './types'
import type { QuizRecord } from '../quizzes/services/quizService'
import { listUserAttempts } from '../quizzes/services/attemptService'
import type { QuizAttempt } from '../quizzes/types'

import { subscribeToModules } from '../modules/services'
import type { ModuleWithId } from '../modules/types'
import '../modules/modules.css'

function answerRevealLabel(value: QuizRecord['settings']['answerReveal']): string {
  if (value === 'after_each') return 'Answers after each question'
  if (value === 'after_submit') return 'Answers after submission'
  return 'Answers hidden'
}

function scoreVisibilityLabel(quiz: QuizRecord): string {
  if (quiz.mode === 'flashcards') return 'Self-rated · ungraded'
  if (quiz.settings.scoreVisibility === 'immediate') return 'Score shown immediately'
  if (quiz.settings.scoreVisibility === 'after_release') return 'Score released later'
  return 'Score hidden'
}

export function StudentClassPage() {
  const { classId = '' } = useParams()
  return <StudentClassDetail key={classId} classId={classId} />
}

function StudentClassDetail({ classId }: { classId: string }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<EnrollmentWithId | null>(null)
  const [enrollmentLoaded, setEnrollmentLoaded] = useState(false)
  const [classroomState, setClassroomState] = useState<{ classId: string; value: ClassWithId | null } | null>(null)
  const [previewState, setPreviewState] = useState<{ classId: string; value: ClassCodeRecord | null } | null>(null)
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(true)
  const [quizzesError, setQuizzesError] = useState<string | null>(null)
  const [quizzesRetry, setQuizzesRetry] = useState(0)
  const [modules, setModules] = useState<ModuleWithId[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [modulesRetry, setModulesRetry] = useState(0)
  const [attemptsByQuiz, setAttemptsByQuiz] = useState<Record<string, Array<QuizAttempt & { id: string }>>>({})
  const [dataLoadedFor, setDataLoadedFor] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const sawMembership = useRef(false)
  const leavingByChoice = useRef(false)

  useEffect(() => {
    if (!user || !classId) return undefined
    return listMyEnrollments(user.uid, (items) => {
      const match = items.find((item) => item.classId === classId) ?? null
      if (match) {
        sawMembership.current = true
        setEnrollment(match)
        setEnrollmentLoaded(true)
      } else if (!sawMembership.current) {
        setEnrollment(null)
        setEnrollmentLoaded(true)
      } else if (!leavingByChoice.current) {
        showToast('info', 'You no longer have access to this class.')
        navigate('/student', { replace: true })
      }
    }, (reason) => { setRequestError(reason.message); setEnrollmentLoaded(true) })
  }, [user, classId, retry, navigate, showToast])

  useEffect(() => {
    if (!enrollment) return undefined
    const dataKey = `${classId}:${enrollment.status}`
    if (enrollment.status === 'pending') {
      let active = true
      void getClassCodePreview(enrollment.codeUsed).then((value) => { if (active) setPreviewState({ classId, value }) })
        .catch((reason: unknown) => { if (active) setRequestError(reason instanceof Error ? reason.message : 'Class preview is unavailable.') })
        .finally(() => { if (active) setDataLoadedFor(dataKey) })
      return () => { active = false }
    }
    if (enrollment.status !== 'active') return undefined

    const stopClass = watchClass(
      classId,
      (value) => {
        setClassroomState({ classId, value })
        setDataLoadedFor(dataKey)
      },
      (reason) => {
        setRequestError(reason.message)
        setDataLoadedFor(dataKey)
      },
    )
    return () => { stopClass() }
  }, [classId, enrollment, retry])

  useEffect(() => {
    if (!enrollment || enrollment.status !== 'active') return undefined
    return watchPublishedQuizzesForClass(
      classId,
      (value) => {
        setQuizzes(value)
        setQuizzesLoading(false)
        setQuizzesError(null)
      },
      (reason) => {
        setQuizzesError(reason.message)
        setQuizzesLoading(false)
      },
    )
  }, [classId, enrollment, quizzesRetry])

  useEffect(() => {
    if (!enrollment || enrollment.status !== 'active') return undefined
    return subscribeToModules(
      classId,
      'student',
      (value) => {
        setModules(value)
        setModulesLoading(false)
        setModulesError(null)
      },
      (reason) => {
        setModulesError(reason.message)
        setModulesLoading(false)
      },
    )
  }, [classId, enrollment, modulesRetry])

  const error = requestError
  const classroom = classroomState?.classId === classId ? classroomState.value : null
  const preview = previewState?.classId === classId ? previewState.value : null
  const dataKey = enrollment ? `${classId}:${enrollment.status}` : null
  const loadingClass = Boolean(dataKey && (enrollment?.status === 'active' || enrollment?.status === 'pending') && dataLoadedFor !== dataKey)

  useEffect(() => {
    if (!user || !quizzes.length) return undefined
    let active = true
    void Promise.all(quizzes.map(async (quiz) => {
      try {
        const attempts = await listUserAttempts(quiz.id, user.uid)
        return [quiz.id, attempts] as const
      } catch {
        return [quiz.id, []] as const
      }
    })).then((entries) => {
      if (active) setAttemptsByQuiz(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [user, quizzes])

  const activeAttempts = quizzes.flatMap((quiz) => {
    const list = attemptsByQuiz[quiz.id] ?? []
    return list.filter((attempt) => attempt.status === 'in_progress').map((attempt) => ({ quiz, attempt }))
  })

  const submittedAttempts = quizzes.flatMap((quiz) => {
    const list = attemptsByQuiz[quiz.id] ?? []
    return list.filter((attempt) => attempt.status === 'submitted').map((attempt) => ({ quiz, attempt }))
  }).sort((a, b) => b.attempt.startedAt.toMillis() - a.attempt.startedAt.toMillis())

  async function confirmLeave() {
    if (!user || !enrollment || enrollment.status !== 'active') return
    setLeaving(true)
    leavingByChoice.current = true
    try {
      await leaveClass(classId, user.uid)
      showToast('success', 'You left the class. Your past attempts are kept by the instructor.')
      navigate('/student', { replace: true })
    } catch (reason) {
      leavingByChoice.current = false
      showToast('error', reason instanceof Error ? reason.message : 'You could not leave this class.')
    } finally { setLeaving(false); setLeaveOpen(false) }
  }

  if (!enrollmentLoaded || loadingClass) return <AppShell><PageHeader eyebrow="YOUR CLASS" title="Loading class…" subtitle="" /><main className="app-shell__content grid gap-4"><Skeleton className="h-40 rounded-3xl" label="Loading class" /><Skeleton className="h-56 rounded-3xl" label="Loading published quizzes" /></main></AppShell>
  if (error) return <AppShell><PageHeader eyebrow="YOUR CLASS" title="Class unavailable" subtitle="We couldn’t load your class details." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Class unavailable" action={<Button type="button" variant="secondary" onClick={() => { setRequestError(null); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert><Button to="/student" variant="secondary">Back to My classes</Button></main></AppShell>
  if (!enrollment) return <AppShell><PageHeader eyebrow="YOUR CLASS" title="Class unavailable" subtitle="This class is no longer in your class list." /><main className="app-shell__content"><Button to="/student">Back to My classes</Button></main></AppShell>
  if (enrollment.status === 'blocked') return <AppShell><PageHeader eyebrow="YOUR CLASS" title={enrollment.className} subtitle="Class access is currently blocked." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Contact your instructor">Your enrollment is blocked, so this class is not available.</Alert><Button to="/student" variant="secondary">Back to My classes</Button></main></AppShell>
  if (enrollment.status === 'pending') return <AppShell>
    <PageHeader eyebrow="CLASS REQUEST" title={`${preview?.className ?? enrollment.className}.`} subtitle={`Section details will appear after approval${preview?.ownerName ? ` · Instructor ${preview.ownerName}` : ''}.`} />
    <main className="app-shell__content grid gap-5" id="main-content"><Alert tone="warning" label="Your request is waiting for approval">The class and its published quizzes will appear here when your instructor approves your request.</Alert><Button to="/student" variant="secondary">Back to My classes</Button></main>
  </AppShell>

  const title = classroom?.name ?? enrollment.className
  const subtitle = classroom ? [classroom.section || 'No section', `Instructor ${classroom.ownerName}`].join(' · ') : 'Your class and published practice.'
  return <AppShell>
    <PageHeader
      eyebrow="YOUR CLASS"
      title={
        <span className="inline-flex items-center gap-2.5 flex-wrap">
          <ClassInitialBadge name={title} color={classroom?.color ?? 'navy'} />
          <span>{title}.</span>
        </span>
      }
      subtitle={subtitle}
      action={
        <div className="flex items-center gap-2">
          <Button to="/student" variant="secondary">Back to classes</Button>
          <Button type="button" variant="secondary" onClick={() => setLeaveOpen(true)}><DoorOpen size={17} aria-hidden="true" /> Leave class</Button>
        </div>
      }
      classColor={classroom?.color ?? 'navy'}
      accent={classroom?.accent}
    />
    <main className="app-shell__content grid gap-6" id="main-content">
      {classroom && <p className="m-0 text-sm text-navy-800-72">{classroom.section || 'No section'} · {classroom.subject || 'No subject'}</p>}
      {activeAttempts.length > 0 && (
        <section className="grid gap-3" aria-labelledby="continue-heading">
          <header><span className="section-kicker">IN PROGRESS</span><h2 id="continue-heading" className="m-0 font-heading text-2xl">Continue</h2></header>
          {activeAttempts.map(({ quiz, attempt }) => (
            <DataCard
              key={attempt.id}
              title={quiz.title}
              meta={`Attempt ${attempt.attemptNumber} · In progress`}
              badge={<Badge>In progress</Badge>}
            >
              <Button to={`/student/quizzes/${quiz.id}/attempts/${attempt.id}`} variant="secondary">
                Resume
              </Button>
            </DataCard>
          ))}
        </section>
      )}
      <section className="grid gap-4" aria-labelledby="modules-heading">
        <header><span className="section-kicker">STUDY MATERIAL</span><h2 id="modules-heading" className="m-0 font-heading text-2xl">Modules</h2></header>
        {modulesLoading ? (
          <div className="grid gap-3">{[0, 1].map((index) => <Skeleton key={index} className="h-32 rounded-3xl" label="Loading modules" />)}</div>
        ) : modulesError ? (
          <Alert tone="error" label="Modules unavailable" action={<Button type="button" variant="secondary" onClick={() => { setModulesLoading(true); setModulesError(null); setModulesRetry((v) => v + 1) }}>Retry</Button>}>{modulesError}</Alert>
        ) : modules.length ? (
          <ol className="module-list" aria-label="Published modules in order">
            {modules.map((item) => (
              <li key={item.id} className="module-list__item">
                <DataCard
                  title={item.title}
                  meta={`${item.resourceCount} ${item.resourceCount === 1 ? 'resource' : 'resources'} · ${item.quizIds.length} attached ${item.quizIds.length === 1 ? 'quiz' : 'quizzes'}`}
                  actions={
                    <Button to={`/student/classes/${classId}/modules/${item.id}`} variant="secondary">
                      Open module
                    </Button>
                  }
                >
                  {item.description ? (
                    <p className="m-0 text-sm text-navy-800-72 line-clamp-2">
                      {item.description}
                    </p>
                  ) : null}
                </DataCard>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No modules yet" description="When your instructor publishes study modules for this class, they will appear here." />
        )}
      </section>
      <section className="grid gap-4" aria-labelledby="published-quizzes-heading">
        <header><span className="section-kicker">CLASS PRACTICE</span><h2 id="published-quizzes-heading" className="m-0 font-heading text-2xl">Published quizzes</h2></header>
        {quizzesLoading ? (
          <div className="grid gap-3">{[0, 1].map((index) => <Skeleton key={index} className="h-28 rounded-3xl" label="Loading published quizzes" />)}</div>
        ) : quizzesError ? (
          <Alert tone="error" label="Quizzes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setQuizzesLoading(true); setQuizzesError(null); setQuizzesRetry((v) => v + 1) }}>Retry</Button>}>{quizzesError}</Alert>
        ) : quizzes.length ? (
          <div className="grid gap-3">
            {quizzes.map((quiz) => {
              const groupQuiz = quiz.settings.participation.type === 'group'
              const attempts = attemptsByQuiz[quiz.id] ?? []
              const latestActive = attempts.find((a) => a.status === 'in_progress')
              const remaining = quiz.settings.attemptsAllowed === null ? null : Math.max(0, quiz.settings.attemptsAllowed - attempts.length)
              const meta = `${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}${quiz.settings.timeLimitMinutes ? ` · ${quiz.settings.timeLimitMinutes} minute time limit` : ' · No time limit'}${remaining !== null ? ` · ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left` : ' · Unlimited attempts'}`
              const to = groupQuiz ? undefined : latestActive ? `/student/quizzes/${quiz.id}/attempts/${latestActive.id}` : `/student/quizzes/${quiz.id}`
              const label = groupQuiz ? 'Start · Group quizzes coming soon' : latestActive ? 'Resume' : 'Start'
              return (
                <DataCard
                  key={quiz.id}
                  title={quiz.title}
                  meta={meta}
                  badge={
                    <div className="flex flex-wrap gap-2">
                      <Badge>{quizModeLabel(quiz.mode)}</Badge>
                      <Badge>{answerRevealLabel(quiz.settings.answerReveal)}</Badge>
                      <Badge>{scoreVisibilityLabel(quiz)}</Badge>
                    </div>
                  }
                >
                  <Button
                    to={to}
                    variant="secondary"
                    disabled={groupQuiz || (remaining === 0 && !latestActive)}
                  >
                    {remaining === 0 && !latestActive ? 'No attempts left' : label}
                  </Button>
                </DataCard>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No published quizzes yet" description="When your instructor publishes a quiz for this class, it will show up here." />
        )}
      </section>
      {submittedAttempts.length > 0 && (
        <section className="grid gap-3" aria-labelledby="attempt-history-heading">
          <header><span className="section-kicker">SUBMISSIONS</span><h2 id="attempt-history-heading" className="m-0 font-heading text-2xl">My attempts</h2></header>
          {submittedAttempts.map(({ quiz, attempt }) => (
            <DataCard
              key={attempt.id}
              title={quiz.title}
              meta={`Attempt ${attempt.attemptNumber}`}
              badge={<Badge>Submitted</Badge>}
            >
              <Button to={`/student/quizzes/${quiz.id}/attempts/${attempt.id}/result`} variant="secondary">
                View result
              </Button>
            </DataCard>
          ))}
        </section>
      )}
    </main>
    <ConfirmDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} onConfirm={() => void confirmLeave()} title="Leave this class?" description="Your instructor keeps your past quiz attempts. You can rejoin later with the class code unless the instructor has blocked you." confirmLabel="Leave class" busy={leaving} closeOnConfirm={false} />
  </AppShell>
}
