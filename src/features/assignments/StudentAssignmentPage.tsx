import { ArrowLeft, Paperclip } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { watchClass } from '../classes/services/classService'
import { listMyEnrollments } from '../classes/services/joinService'
import type { ClassWithId, EnrollmentWithId } from '../classes/types'
import { FileList } from './FileList'
import { formatDue, formatPoints } from './format'
import { subscribeToAssignment, subscribeToMyTurnIn } from './services'
import { StudentTurnIn } from './StudentTurnIn'
import type { AssignmentWithId, TurnInWithId } from './types'
import { useGoogleDrive } from './useGoogleDrive'
import '../modules/modules.css'
import './assignments.css'

export function StudentAssignmentPage() {
  const { classId = '', assignmentId = '' } = useParams()
  return <StudentAssignmentDetail key={`${classId}:${assignmentId}`} classId={classId} assignmentId={assignmentId} />
}

function Shell({ classId, eyebrow, title, subtitle, children }: { classId: string; eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
  return <AppShell>
    <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} action={<Button to={`/student/classes/${classId}`} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to class</Button>} />
    <main className="app-shell__content grid gap-5" id="main-content">{children}</main>
  </AppShell>
}

function StudentAssignmentDetail({ classId, assignmentId }: { classId: string; assignmentId: string }) {
  const { user, profile } = useAuth()
  const drive = useGoogleDrive()
  const [enrollment, setEnrollment] = useState<EnrollmentWithId | null>(null)
  const [enrollmentLoaded, setEnrollmentLoaded] = useState(false)
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [assignment, setAssignment] = useState<AssignmentWithId | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [turnIn, setTurnIn] = useState<TurnInWithId | null>(null)
  const [retry, setRetry] = useState(0)
  const studentId = user?.uid ?? ''

  useEffect(() => {
    if (!studentId) return undefined
    return listMyEnrollments(studentId, (items) => {
      setEnrollment(items.find((item) => item.classId === classId && item.status === 'active') ?? null)
      setEnrollmentLoaded(true)
    }, (reason) => { setError(reason.message); setEnrollmentLoaded(true) })
  }, [studentId, classId, retry])

  useEffect(() => {
    if (!enrollment) return undefined
    return watchClass(classId, setClassroom, (reason) => setError(reason.message))
  }, [enrollment, classId, retry])

  useEffect(() => {
    if (!enrollment) return undefined
    return subscribeToAssignment(classId, assignmentId, (found) => {
      setAssignment(found && found.status === 'published' ? found : null); setLoaded(true); setError('')
    }, (reason) => { setError(reason.message); setLoaded(true) })
  }, [enrollment, classId, assignmentId, retry])

  useEffect(() => {
    if (!enrollment || !studentId) return undefined
    return subscribeToMyTurnIn(classId, assignmentId, studentId, setTurnIn, (reason) => setError(reason.message))
  }, [enrollment, classId, assignmentId, studentId, retry])

  if (!enrollmentLoaded || (enrollment && !loaded && !error)) return <Shell classId={classId} eyebrow="ASSIGNMENT" title="Loading assignment…" subtitle=""><Skeleton className="h-40 rounded-3xl" label="Loading assignment" /><Skeleton className="h-56 rounded-3xl" label="Loading your work" /></Shell>
  if (error) return <Shell classId={classId} eyebrow="ASSIGNMENT" title="Assignment unavailable" subtitle="We couldn’t load this assignment."><Alert tone="error" label="Assignment unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoaded(false); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert></Shell>
  if (!enrollment || !assignment) return <Shell classId={classId} eyebrow="ASSIGNMENT" title="Assignment not available" subtitle="It may have been unpublished or removed."><Alert tone="warning" label="Assignment not available">Return to your class to see the work that is currently available.</Alert></Shell>

  const studentName = profile?.name || user?.displayName || user?.email || 'Student'
  return <AppShell>
    <PageHeader eyebrow="ASSIGNMENT" title={assignment.title} subtitle={classroom?.name ?? ''} action={<Button to={`/student/classes/${classId}`} variant="secondary"><ArrowLeft size={16} aria-hidden="true" /> Back to class</Button>} classColor={classroom?.color ?? 'navy'} accent={classroom?.accent} />
    <main className="app-shell__content grid gap-6" id="main-content">
      <nav className="module-breadcrumb" aria-label="Breadcrumb"><Link to="/student">Classes</Link><span aria-hidden="true">›</span><Link to={`/student/classes/${classId}`}>{classroom?.name ?? 'Class'}</Link><span aria-hidden="true">›</span><span aria-current="page">{assignment.title}</span></nav>
      <ul className="assignment-meta" aria-label="Assignment details"><li><Badge>{formatDue(assignment.dueAt)}</Badge></li><li>{formatPoints(assignment.points)}</li></ul>
      {assignment.instructions && <p className="assignment-instructions">{assignment.instructions}</p>}
      {assignment.attachments.length > 0 && <SectionCard title="Files from your instructor" description="Open them in Google Drive. They are view-only." icon={<Paperclip size={20} />}><FileList files={assignment.attachments} label="Files from your instructor" /></SectionCard>}
      <StudentTurnIn assignment={assignment} turnIn={turnIn} studentId={studentId} studentName={studentName} drive={drive} />
    </main>
  </AppShell>
}
