import { useEffect, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ClassPattern } from './ClassPatterns'
import { getClassCodePreview, listMyEnrollments } from './services/joinService'
import { watchClass } from './services/classService'
import { watchPublishedQuizzesForClass } from './services/quizService'
import type { ClassCodeRecord, ClassWithId, EnrollmentWithId } from './types'
import type { QuizRecord } from '../quizzes/services/quizService'

interface ClassDetails { classroom?: ClassWithId | null; preview?: ClassCodeRecord | null; quizzes?: QuizRecord[] }

export function StudentClassesPage() {
  const { user } = useAuth()
  const uid = user?.uid
  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [details, setDetails] = useState<Record<string, ClassDetails>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!uid) return undefined
    return listMyEnrollments(uid, (items) => { setEnrollments(items); setLoading(false); setError('') }, (reason) => { setError(reason.message); setLoading(false) })
  }, [uid, retry])

  useEffect(() => {
    if (!uid || !enrollments.length) return undefined
    let active = true
    const subscriptions: Array<() => void> = []
    for (const enrollment of enrollments) {
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

  return <AppShell>
    <PageHeader eyebrow="STUDENT SPACE" title="My classes." subtitle="Your classes and the practice shared by each instructor." action={<Button to="/join"><Plus size={18} aria-hidden="true" /> Join class</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      {error && <Alert tone="error" label="Classes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>}
      {loading ? <div className="grid gap-4 sm:grid-cols-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-56 rounded-3xl" label="Loading class" />)}</div>
        : enrollments.length === 0 ? <EmptyState title="Join a class to get started" description="Use the invitation code from your instructor to see class practice here." action={<Button to="/join"><Plus size={17} aria-hidden="true" /> Join a class</Button>} />
          : <section className="grid gap-4 sm:grid-cols-2" aria-label="Your classes">{enrollments.map((enrollment) => {
            const detail = details[enrollment.id]
            const classroom = detail?.classroom
            const pending = enrollment.status === 'pending'
            const blocked = enrollment.status === 'blocked'
            const title = classroom?.name ?? enrollment.className
            const section = classroom ? classroom.section || 'No section' : pending ? 'Section details after approval' : 'Section'
            const instructor = classroom?.ownerName ?? detail?.preview?.ownerName
            const meta = [section, instructor ? `Instructor ${instructor}` : pending ? 'Instructor details available after approval' : 'Instructor'].filter(Boolean).join(' · ')
            return <DataCard key={enrollment.id} title={title} meta={meta} badge={<div className="flex flex-wrap gap-2"><Badge>{pending ? 'Waiting for approval' : blocked ? 'Blocked' : 'Active'}</Badge>{pending && <Badge>Pending</Badge>}</div>}>
              <ClassPattern accent={classroom?.accent ?? 'solid'} />
              <p className="m-0 text-sm text-navy-800-72">{pending ? 'Published quizzes will appear after your instructor approves the request.' : blocked ? 'Contact your instructor about access to this class.' : `${detail?.quizzes?.length ?? 0} published ${detail?.quizzes?.length === 1 ? 'quiz' : 'quizzes'}`}</p>
              {blocked ? <span className="inline-flex min-h-11 items-center text-sm font-semibold">Contact your instructor</span> : <Button to={`/student/classes/${enrollment.classId}`} variant="secondary">{pending ? 'View request' : 'Open class'} <ArrowRight size={16} aria-hidden="true" /></Button>}
            </DataCard>
          })}</section>}
      {!loading && enrollments.some((entry) => entry.status === 'active') && <p className="sr-only" aria-live="polite">Class and published quiz counts update automatically.</p>}
    </main>
  </AppShell>
}
