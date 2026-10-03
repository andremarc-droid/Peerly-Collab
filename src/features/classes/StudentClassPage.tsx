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
import { watchClass } from './services/classService'
import { watchPublishedQuizzesForClass } from './services/quizService'
import type { ClassCodeRecord, ClassWithId, EnrollmentWithId } from './types'
import type { QuizRecord } from '../quizzes/services/quizService'

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
  const [quizState, setQuizState] = useState<{ classId: string; value: QuizRecord[] } | null>(null)
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

    let classReady = false
    let quizzesReady = false
    const updateReadyState = () => { if (classReady && quizzesReady) setDataLoadedFor(dataKey) }
    const fail = (reason: Error) => { setRequestError(reason.message); setDataLoadedFor(dataKey) }
    const stopClass = watchClass(classId, (value) => { setClassroomState({ classId, value }); classReady = true; updateReadyState() }, fail)
    const stopQuizzes = watchPublishedQuizzesForClass(classId, (value) => { setQuizState({ classId, value }); quizzesReady = true; updateReadyState() }, fail)
    return () => { stopClass(); stopQuizzes() }
  }, [classId, enrollment, retry])

  const error = requestError
  const classroom = classroomState?.classId === classId ? classroomState.value : null
  const preview = previewState?.classId === classId ? previewState.value : null
  const quizzes = quizState?.classId === classId ? quizState.value : []
  const dataKey = enrollment ? `${classId}:${enrollment.status}` : null
  const loadingClass = Boolean(dataKey && (enrollment?.status === 'active' || enrollment?.status === 'pending') && dataLoadedFor !== dataKey)

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
    <PageHeader eyebrow="YOUR CLASS" title={`${title}.`} subtitle={subtitle} action={<Button type="button" variant="secondary" onClick={() => setLeaveOpen(true)}><DoorOpen size={17} aria-hidden="true" /> Leave class</Button>} />
    <main className="app-shell__content grid gap-5" id="main-content">
      {classroom && <p className="m-0 text-sm text-navy-800-72">{classroom.section || 'No section'} · {classroom.subject || 'No subject'}</p>}
      {quizzes.length ? <section className="grid gap-4" aria-labelledby="published-quizzes-heading"><header><span className="section-kicker">CLASS PRACTICE</span><h2 id="published-quizzes-heading" className="m-0 font-heading text-2xl">Published quizzes</h2></header>{quizzes.map((quiz) => { const groupQuiz = quiz.settings.participation.type === 'group'; return <DataCard key={quiz.id} title={quiz.title} meta={`${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}${quiz.settings.timeLimitMinutes ? ` · ${quiz.settings.timeLimitMinutes} minute time limit` : ' · No time limit'}`} badge={<div className="flex flex-wrap gap-2"><Badge>{quiz.mode === 'quiz' ? 'Quiz' : 'Flashcards'}</Badge><Badge>{answerRevealLabel(quiz.settings.answerReveal)}</Badge><Badge>{scoreVisibilityLabel(quiz)}</Badge></div>}><Button to={groupQuiz ? undefined : `/student/quizzes/${quiz.id}`} variant="secondary" disabled={groupQuiz}>{groupQuiz ? <>Start · Group quizzes coming soon</> : 'Start'}</Button></DataCard>})}</section>
        : <EmptyState title="No published quizzes yet" description="When your instructor publishes a quiz for this class, it will show up here." />}
    </main>
    <ConfirmDialog open={leaveOpen} onClose={() => setLeaveOpen(false)} onConfirm={() => void confirmLeave()} title="Leave this class?" description="Your instructor keeps your past quiz attempts. You can rejoin later with the class code unless the instructor has blocked you." confirmLabel="Leave class" busy={leaving} closeOnConfirm={false} />
  </AppShell>
}
