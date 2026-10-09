import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../shared/ui/StatTile'
import { Tabs } from '../../shared/ui/Tabs'
import { useToast } from '../../shared/ui/useToast'
import { listMyClasses, rotateJoinCode, setJoinEnabled, watchClass } from './services'
import { countClassEnrollments, countPendingEnrollments, countStudentsInClass, watchEnrollments } from './services/enrollmentService'
import { watchQuizzesForClass } from './services/quizService'
import type { QuizRecord } from '../quizzes/services'
import type { ClassWithId, EnrollmentWithId } from './types'
import { ClassCodePanel } from './ClassCodePanel'
import { ClassInitialBadge } from './ClassInitialBadge'
import { ClassPeopleTab } from './ClassPeopleTab'
import { ClassQuizzesTab } from './ClassQuizzesTab'
import { ClassCanvasTab } from './ClassCanvasTab'
import { countActivitiesByMode } from './classActivities'
import { ClassSettingsTab } from './ClassSettingsTab'
import { ModulesTab } from '../modules/ModulesTab'
import { AssignmentsTab } from '../assignments/AssignmentsTab'

interface ClassCounts { students: number; pending: number; enrollments: number }
const emptyCounts: ClassCounts = { students: 0, pending: 0, enrollments: 0 }

export function ClassPage() {
  const { classId = '' } = useParams()
  const { user } = useAuth()
  const ownerId = user?.uid
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [quizzesLoading, setQuizzesLoading] = useState(true)
  const [quizzesError, setQuizzesError] = useState<string | null>(null)
  const [quizzesRetry, setQuizzesRetry] = useState(0)
  const [counts, setCounts] = useState(emptyCounts)
  const [loading, setLoading] = useState(true)
  const [resolvedClassId, setResolvedClassId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [mutating, setMutating] = useState(false)
  const requestedShare = Boolean(location.state && typeof location.state === 'object' && 'shareCode' in location.state && location.state.shareCode)
  const [shareOnOpen] = useState(requestedShare)
  const pageLoading = loading || resolvedClassId !== classId

  useEffect(() => {
    if (requestedShare) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, navigate, requestedShare])

  useEffect(() => {
    if (!ownerId) return undefined
    let active = true
    listMyClasses(ownerId).then((items) => { if (active) setClasses(items) }).catch((reason: unknown) => { if (active) showToast('error', reason instanceof Error ? reason.message : 'Class list is unavailable.') })
    return () => { active = false }
  }, [ownerId, showToast])

  const refreshCounts = useCallback(async (value: ClassWithId) => {
    try {
      const [students, pending, enrollmentsCount] = await Promise.all([
        countStudentsInClass(value.id, value.ownerId),
        countPendingEnrollments(value.id, value.ownerId),
        countClassEnrollments(value.id, value.ownerId),
      ])
      setCounts({ students, pending, enrollments: enrollmentsCount })
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Class counts could not be loaded.') }
  }, [showToast])

  useEffect(() => {
    if (!classId) return undefined
    return watchClass(classId, (value) => { setClassroom(value); setResolvedClassId(classId); setLoading(false); if (value) void refreshCounts(value) }, (reason) => { setError(reason.message); setResolvedClassId(classId); setLoading(false) })
  }, [classId, retry, refreshCounts])

  useEffect(() => {
    if (!classroom || !ownerId) return undefined
    return watchEnrollments(classroom.id, ownerId, (items) => { setEnrollments(items); void refreshCounts(classroom) }, (reason) => setError(reason.message))
  }, [classroom, ownerId, refreshCounts])

  const watchedClassId = classroom?.id
  useEffect(() => {
    if (!watchedClassId || !ownerId) return undefined
    return watchQuizzesForClass(watchedClassId, ownerId,
      (items) => { setQuizzes(items); setQuizzesError(null); setQuizzesLoading(false) },
      (reason) => { setQuizzesError(reason.message); setQuizzesLoading(false) })
  }, [watchedClassId, ownerId, quizzesRetry])

  const activityFeed = {
    items: quizzes,
    loading: quizzesLoading,
    error: quizzesError,
    onRetry: () => { setQuizzesLoading(true); setQuizzesError(null); setQuizzesRetry((value) => value + 1) },
  }

  async function toggleJoining(open: boolean) {
    if (!classroom) return
    setMutating(true)
    try { await setJoinEnabled(classroom.id, open); showToast('success', open ? 'Joining is open.' : 'Joining is paused.') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Joining could not be updated.') }
    finally { setMutating(false) }
  }

  async function regenerate() {
    if (!classroom) return
    setMutating(true)
    try {
      await rotateJoinCode(classroom.id)
      showToast('success', 'New join code created. The previous code no longer works.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Join code could not be regenerated.') }
    finally { setMutating(false) }
  }

  if (pageLoading) return <AppShell><PageHeader eyebrow="CLASSROOM" title="Loading class…" subtitle="" /><main className="app-shell__content grid gap-5"><Skeleton className="h-40 rounded-3xl" label="Loading class details" /><Skeleton className="h-80 rounded-3xl" label="Loading class roster" /></main></AppShell>
  if (error || !classroom) return <AppShell><PageHeader eyebrow="CLASSROOM" title="Class unavailable" subtitle="We couldn’t open this class." /><main className="app-shell__content grid gap-4">{error ? <Alert tone="error" label="Class unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setResolvedClassId(null); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert> : <Alert tone="error" label="Class not found">It may have been removed or you may not have access.</Alert>}<Button to="/instructor" variant="secondary">Back to My classes</Button></main></AppShell>

  const subtitle = [classroom.section, classroom.subject].filter(Boolean).join(' · ') || 'Manage learners, class quizzes, and invitations.'
  const { quizzes: quizCount, canvas: canvasCount, total: totalActivities } = countActivitiesByMode(quizzes)

  const tabs = [
    { label: 'Modules', content: <ModulesTab key={classroom.id} classroom={classroom} /> },
    { label: 'Assignments', content: <AssignmentsTab key={classroom.id} classroom={classroom} /> },
    { label: 'Quizzes', count: quizCount, content: <ClassQuizzesTab key={classroom.id} classroom={classroom} classes={classes} feed={activityFeed} /> },
    { label: 'Canvas', count: canvasCount, content: <ClassCanvasTab key={classroom.id} classroom={classroom} classes={classes} feed={activityFeed} /> },
    { label: 'People', count: counts.students + counts.pending, content: <ClassPeopleTab key={classroom.id} classroom={classroom} enrollments={enrollments} counts={counts} /> },
    { label: 'Settings', content: <ClassSettingsTab key={classroom.id} classroom={classroom} counts={{ students: counts.enrollments, quizzes: totalActivities }} /> },
  ]
  const tabNames = ['modules', 'assignments', 'quizzes', 'canvas', 'people', 'settings']
  const selectedTab = tabNames.indexOf(searchParams.get('tab') ?? 'modules')
  const defaultTab = selectedTab < 0 ? 0 : selectedTab

  return <AppShell>
    <PageHeader
      eyebrow={classroom.status === 'active' ? 'ACTIVE CLASS' : 'ARCHIVED CLASS'}
      title={
        <span className="inline-flex items-center gap-2.5 flex-wrap">
          <ClassInitialBadge name={classroom.name} color={classroom.color ?? 'navy'} />
          <span>{classroom.name}.</span>
        </span>
      }
      subtitle={subtitle}
      action={<Button to="/instructor" variant="secondary">Back to My classes</Button>}
      mobileAction={null}
      classColor={classroom.color ?? 'navy'}
      accent={classroom.accent}
    />
    <main className="app-shell__content grid gap-6" id="main-content">
      <StatRow>
        <StatTile label="Students" value={String(counts.students)} hint="Active enrollments" />
        <StatTile label="Pending requests" value={String(counts.pending)} hint="Waiting for approval" />
        <StatTile
          label="Activities"
          value={String(totalActivities)}
          hint={`${quizCount} ${quizCount === 1 ? 'quiz' : 'quizzes'} · ${canvasCount} canvas`}
        />
      </StatRow>
      <ClassCodePanel classroom={classroom} onJoiningChange={(open) => void toggleJoining(open)} onRegenerate={regenerate} busy={mutating} shareOnOpen={shareOnOpen} />
      <Tabs key={`${classroom.id}:${defaultTab}`} label={`${classroom.name} sections`} tabs={tabs} defaultIndex={defaultTab} onChange={(index) => setSearchParams({ tab: tabNames[index] ?? 'modules' })} />
    </main>
  </AppShell>
}
