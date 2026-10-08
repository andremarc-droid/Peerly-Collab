import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { listMyEnrollments } from '../classes/services/joinService'
import { watchPublishedQuizzesForClass } from '../classes/services/quizService'
import type { EnrollmentWithId } from '../classes/types'
import { listUserAttempts } from '../quizzes/services/attemptService'
import type { QuizAttempt } from '../quizzes/types'
import { QuizTypeBadge } from '../quizzes/QuizTypeBadge'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { DataCard } from '../../shared/ui/DataCard'
import { EmptyState } from '../../shared/ui/EmptyState'
import { PageHeader } from '../../shared/ui/PageHeader'
import { resolveListStatus } from '../../shared/ui/listState'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { Toolbar } from '../../shared/ui/Toolbar'
import type { QuizRecord } from '../quizzes/services/quizService'

type CatalogQuiz = QuizRecord & { className: string; attempts: Array<QuizAttempt & { id: string }> }
const revealLabel = (quiz: QuizRecord) => quiz.settings.answerReveal === 'after_each' ? 'Answers after each question' : quiz.settings.answerReveal === 'after_submit' ? 'Answers after submission' : 'Answers hidden'
const scoreLabel = (quiz: QuizRecord) => quiz.mode === 'flashcards' ? 'Self-rated · ungraded' : quiz.settings.scoreVisibility === 'immediate' ? 'Score shown immediately' : quiz.settings.scoreVisibility === 'after_release' ? 'Score released later' : 'Score hidden'

export function StudentQuizCatalogPage() {
  const { user } = useAuth()
  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [quizzes, setQuizzes] = useState<CatalogQuiz[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!user) return undefined
    return listMyEnrollments(user.uid, (items) => {
      setEnrollments(items)
      if (!items.some((item) => item.status === 'active')) { setQuizzes([]); setLoading(false) }
    }, (reason) => { setError(reason.message); setLoading(false) })
  }, [user, retry])

  useEffect(() => {
    const active = enrollments.filter((item) => item.status === 'active')
    if (!active.length) return undefined
    let mounted = true
    const byClass = new Map<string, QuizRecord[]>()
    const disposers = active.map((enrollment) => watchPublishedQuizzesForClass(enrollment.classId, (items) => {
      byClass.set(enrollment.classId, items)
      const all = active.flatMap((entry) => (byClass.get(entry.classId) ?? []).map((quiz) => ({ ...quiz, className: entry.className, attempts: [] })))
      setQuizzes(all)
      setLoading(false)
      setError('')
      void Promise.all(all.map(async (quiz) => ({ ...quiz, attempts: await listUserAttempts(quiz.id, user!.uid) })))
        .then((withAttempts) => { if (mounted) setQuizzes(withAttempts) })
        .catch((reason: unknown) => { if (mounted) setError(reason instanceof Error ? reason.message : 'Attempts could not be loaded.') })
    }, (reason) => { if (mounted) { setError(reason.message); setLoading(false) } }))
    return () => { mounted = false; disposers.forEach((dispose) => dispose()) }
  }, [enrollments, user])

  const activeClassIds = new Set(enrollments.filter((item) => item.status === 'active').map((item) => item.classId))
  const visibleQuizzes = quizzes.filter((quiz) => activeClassIds.has(quiz.classId ?? ''))
  const filtered = useMemo(() => visibleQuizzes.filter((quiz) => quiz.title.toLowerCase().includes(query.toLowerCase()) && (mode === 'all' || quiz.mode === mode)), [visibleQuizzes, query, mode])
  const quizGroups = enrollments.filter((item) => item.status === 'active').map((entry) => ({ entry, items: filtered.filter((quiz) => quiz.classId === entry.classId) }))
  const activeAttempts = filtered.flatMap((quiz) => quiz.attempts.filter((attempt) => attempt.status === 'in_progress').map((attempt) => ({ quiz, attempt })))
  const history = filtered.flatMap((quiz) => quiz.attempts.filter((attempt) => attempt.status === 'submitted').map((attempt) => ({ quiz, attempt })))
    .sort((a, b) => b.attempt.startedAt.toMillis() - a.attempt.startedAt.toMillis())

  return <AppShell><PageHeader eyebrow="STUDENT SPACE" title="Practice." subtitle="Find published quizzes from your classes and pick up where you left off." action={<Button to="/join">Join class</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      <Toolbar query={query} onQueryChange={setQuery} placeholder="Search quizzes" filters={<Select label="Quiz mode" options={[{ value: 'all', label: 'All modes' }, { value: 'quiz', label: 'Quiz' }, { value: 'flashcards', label: 'Flashcards' }, { value: 'canvas', label: 'Canvas' }]} value={mode} onChange={(event) => setMode(event.target.value)} />} />
      {(() => {
        const status = resolveListStatus({ loading, error, count: enrollments.length })
        if (status === 'error') {
          return <Alert tone="error" label="Quizzes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setError(''); setLoading(true); setRetry((n) => n + 1) }}>Retry</Button>}>{error}</Alert>
        }
        if (status === 'loading') {
          return <div className="grid gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-3xl" label="Loading quizzes" />)}</div>
        }
        return <>
          <section className="grid gap-3" aria-labelledby="my-classes-heading"><h2 id="my-classes-heading" className="m-0 font-heading text-2xl">My classes</h2>{enrollments.length === 0 ? <EmptyState title="Join a class to get started" description="Use your instructor’s code to see published practice and class details." action={<Button to="/join">Join a class</Button>} /> : <div className="grid gap-3 sm:grid-cols-2">{enrollments.map((entry) => <DataCard key={entry.id} title={entry.className} meta={entry.status === 'active' ? 'Class and published quizzes' : entry.status === 'pending' ? 'Your request is waiting for approval' : 'Contact your instructor about access'} badge={<Badge>{entry.status === 'pending' ? 'Waiting for approval' : entry.status === 'active' ? 'Active' : 'Blocked'}</Badge>}>{entry.status === 'blocked' ? <span className="text-sm">Contact your instructor</span> : <Button to={`/student/classes/${entry.classId}`} variant="secondary">Open class</Button>}</DataCard>)}</div>}</section>
          <section className="grid gap-3" aria-labelledby="continue-heading"><h2 id="continue-heading" className="m-0 font-heading text-2xl">Continue</h2>{activeAttempts.length ? activeAttempts.map(({ quiz, attempt }) => <QuizCard key={attempt.id} quiz={quiz} attempt={attempt} action="Resume" />) : <p className="m-0 text-sm text-navy-800-72">You have no quizzes in progress.</p>}</section>
          <section className="grid gap-4" aria-labelledby="catalog-heading"><h2 id="catalog-heading" className="m-0 font-heading text-2xl">Available quizzes</h2>{filtered.length === 0 ? <EmptyState title="No quizzes to show" description={quizzes.length ? 'Try another search or mode filter.' : 'Published quizzes from your active classes will appear here.'} action={<Button to="/join">Join a class</Button>} /> : quizGroups.map(({ entry, items }) => <section className="grid gap-3" key={entry.classId} aria-labelledby={`class-quizzes-${entry.classId}`}><h3 id={`class-quizzes-${entry.classId}`} className="m-0 font-heading text-xl">{entry.className}</h3>{items.length ? items.map((quiz) => <CatalogCard key={quiz.id} quiz={quiz} />) : <p className="m-0 text-sm text-navy-800-72">No matching published quizzes in this class.</p>}</section>)}</section>
          <section className="grid gap-3" aria-labelledby="attempt-history"><h2 id="attempt-history" className="m-0 font-heading text-2xl">My attempts</h2>{history.length ? history.map(({ quiz, attempt }) => <QuizCard key={attempt.id} quiz={quiz} attempt={attempt} action="View result" />) : <p className="m-0 text-sm text-navy-800-72">Submitted attempts will appear here.</p>}</section>
        </>
      })()}
    </main>
  </AppShell>
}

function CatalogCard({ quiz }: { quiz: CatalogQuiz }) {
  const remaining = quiz.settings.attemptsAllowed === null ? null : Math.max(0, quiz.settings.attemptsAllowed - quiz.attempts.length)
  const latest = quiz.attempts.find((item) => item.status === 'in_progress')
  const disabledGroup = quiz.settings.participation.type === 'group'
  const questionsLabel = quiz.mode === 'canvas' ? '1 canvas board' : `${quiz.questionCount} question${quiz.questionCount === 1 ? '' : 's'}`
  return <DataCard title={quiz.title} meta={`${quiz.ownerName} · ${quiz.className} · ${questionsLabel}${quiz.settings.timeLimitMinutes ? ` · ${quiz.settings.timeLimitMinutes} min` : ''} · ${remaining === null ? 'Unlimited attempts' : `${remaining} attempts left`}`} badge={<div className="flex flex-wrap gap-2"><QuizTypeBadge mode={quiz.mode} />{quiz.mode === 'canvas' && quiz.boardKind === 'blank' && <Badge>Graded by instructor</Badge>}<Badge>{revealLabel(quiz)}</Badge><Badge>{scoreLabel(quiz)}</Badge></div>}><Button to={disabledGroup ? undefined : latest ? `/student/quizzes/${quiz.id}/attempts/${latest.id}` : `/student/quizzes/${quiz.id}`} disabled={disabledGroup || (remaining === 0 && !latest)} variant="secondary">{disabledGroup ? 'Group quizzes coming soon' : latest ? 'Resume' : 'View quiz'}</Button></DataCard>
}

function QuizCard({ quiz, attempt, action }: { quiz: CatalogQuiz; attempt: QuizAttempt & { id: string }; action: string }) {
  const to = action === 'Resume' ? `/student/quizzes/${quiz.id}/attempts/${attempt.id}` : `/student/quizzes/${quiz.id}/attempts/${attempt.id}/result`
  return <DataCard title={quiz.title} meta={`${quiz.className} · Attempt ${attempt.attemptNumber}`} badge={<Badge>{attempt.status === 'in_progress' ? 'In progress' : 'Submitted'}</Badge>}><Button to={to} variant="secondary">{action}</Button></DataCard>
}
