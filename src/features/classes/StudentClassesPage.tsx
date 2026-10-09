import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { watchPublicProfile } from '../profile/profileService'
import type { PublicProfile } from '../profile/profileTypes'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { resolveListStatus } from '../../shared/ui/listState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ToastContext } from '../../shared/ui/toastContext'
import { ClassTile } from './ClassTile'
import { getClassCodePreview, leaveClass, listMyEnrollments } from './services/joinService'
import { watchClass } from './services/classService'
import { watchPublishedQuizzesForClass } from './services/quizService'
import type { ClassCodeRecord, ClassWithId, EnrollmentWithId } from './types'
import type { QuizRecord } from '../quizzes/services/quizService'

interface ClassDetails { classroom?: ClassWithId | null; preview?: ClassCodeRecord | null; quizzes?: QuizRecord[] }

export function StudentClassesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const uid = user?.uid
  const toastContext = useContext(ToastContext)
  const showToast = toastContext?.showToast ?? (() => undefined)
  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [details, setDetails] = useState<Record<string, ClassDetails>>({})
  const [instructorProfiles, setInstructorProfiles] = useState<Record<string, PublicProfile | null>>({})
  const [leaveEnrollment, setLeaveEnrollment] = useState<EnrollmentWithId | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [retry, setRetry] = useState(0)
  const enrollmentStatuses = useRef<Record<string, EnrollmentWithId['status']>>({})

  useEffect(() => {
    if (!uid) return undefined
    enrollmentStatuses.current = {}
    return listMyEnrollments(uid, (items) => {
      const newlyApproved = items.find((item) => item.status === 'active' && enrollmentStatuses.current[item.id] === 'pending')
      enrollmentStatuses.current = Object.fromEntries(items.map((item) => [item.id, item.status]))
      setEnrollments(items); setLoading(false); setError('')
      if (newlyApproved) navigate(`/student/classes/${newlyApproved.classId}`, { replace: true })
    }, (reason) => { setError(reason.message); setLoading(false) })
  }, [uid, retry, navigate])

  useEffect(() => {
    if (!uid || !enrollments.length) return undefined
    let active = true
    const subscriptions: Array<() => void> = []
    const watchedInstructorIds = new Set<string>()
    for (const enrollment of enrollments) {
      if (!watchedInstructorIds.has(enrollment.ownerId)) {
        watchedInstructorIds.add(enrollment.ownerId)
        subscriptions.push(watchPublicProfile(enrollment.ownerId, (profile) => {
          if (active) {
            setInstructorProfiles((current) => ({ ...current, [enrollment.ownerId]: profile }))
            setProfileError('')
          }
        }, (reason) => { if (active) setProfileError(reason.message) }))
      }
      if (enrollment.status === 'active') {
        subscriptions.push(watchClass(enrollment.classId, (classroom) => {
          if (active) setDetails((current) => ({ ...current, [enrollment.id]: { ...current[enrollment.id], classroom } }))
        }, (reason) => { if (active) setError(reason.message) }))
        subscriptions.push(watchPublishedQuizzesForClass(enrollment.classId, (quizzes) => {
          if (active) setDetails((current) => ({ ...current, [enrollment.id]: { ...current[enrollment.id], quizzes } }))
        }, (reason) => { if (active) setError(reason.message) }))
      } else if (enrollment.status === 'pending') {
        void getClassCodePreview(enrollment.codeUsed).then((preview) => {
          if (active) setDetails((current) => ({ ...current, [enrollment.id]: { ...current[enrollment.id], preview } }))
        }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Class information is unavailable.') })
      }
    }
    return () => { active = false; subscriptions.forEach((unsubscribe) => unsubscribe()) }
  }, [uid, enrollments])

  async function confirmLeave() {
    if (!uid || !leaveEnrollment) return
    setLeaving(true)
    try {
      await leaveClass(leaveEnrollment.classId, uid)
      showToast('success', 'You left the class. Your past attempts are kept by the instructor.')
      setEnrollments((current) => current.filter((e) => e.id !== leaveEnrollment.id))
      setLeaveEnrollment(null)
    } catch (reason) {
      showToast('error', reason instanceof Error ? reason.message : 'Could not leave class.')
    } finally {
      setLeaving(false)
    }
  }

  return <AppShell>
    <PageHeader eyebrow="STUDENT SPACE" title="My classes." subtitle="Your classes and the practice shared by each instructor." action={<Button to="/join"><Plus size={18} aria-hidden="true" /> Join class</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      {profileError && <Alert tone="error" label="Instructor profiles unavailable">{profileError} Class names and saved instructor names are still shown.</Alert>}
      {(() => {
        const listStatus = resolveListStatus({ loading, error, count: enrollments.length })
        if (listStatus === 'error') {
          return <Alert tone="error" label="Classes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>
        }
        if (listStatus === 'loading') {
          return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-56 rounded-3xl" label="Loading class" />)}</div>
        }
        if (listStatus === 'empty') {
          return <EmptyState title="Join a class to get started" description="Use the invitation code from your instructor to see class practice here." action={<Button to="/join"><Plus size={17} aria-hidden="true" /> Join a class</Button>} />
        }
        return <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" aria-label="Your classes">{enrollments.map((enrollment) => {
          const detail = details[enrollment.id]
          const classroom = detail?.classroom
          const title = classroom?.name ?? enrollment.className
          const publicProfile = instructorProfiles[enrollment.ownerId]
          const instructor = publicProfile?.name ?? classroom?.ownerName ?? detail?.preview?.ownerName
          return <ClassTile
            role="student"
            key={enrollment.id}
            id={enrollment.classId}
            name={title}
            section={classroom?.section ?? ''}
            subject={classroom?.subject ?? ''}
            color={classroom?.color}
            accent={classroom?.accent}
            instructorName={instructor}
            instructorPhotoURL={publicProfile?.photoURL ?? null}
            availableQuizzesCount={detail?.quizzes?.length ?? 0}
            enrollmentStatus={enrollment.status}
            onLeaveClass={() => setLeaveEnrollment(enrollment)}
          />
        })}</section>
      })()}
      {!loading && enrollments.some((entry) => entry.status === 'active') && <p className="sr-only" aria-live="polite">Class and published quiz counts update automatically.</p>}
    </main>
    {leaveEnrollment && (
      <ConfirmDialog
        open={Boolean(leaveEnrollment)}
        onClose={() => setLeaveEnrollment(null)}
        onConfirm={() => void confirmLeave()}
        title="Leave this class?"
        description="Your instructor keeps your past quiz attempts. You can rejoin later with the class code unless the instructor has blocked you."
        confirmLabel="Leave class"
        busy={leaving}
        closeOnConfirm={false}
      />
    )}
  </AppShell>
}
