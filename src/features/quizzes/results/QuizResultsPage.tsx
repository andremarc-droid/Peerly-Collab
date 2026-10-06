import { Clock3, Download, Eye } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataTable } from '../../../shared/ui/DataTable'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { Select } from '../../../shared/ui/Select'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../../shared/ui/StatTile'
import { Switch } from '../../../shared/ui/Switch'
import { useToast } from '../../../shared/ui/useToast'
import { getClass } from '../../classes/services/classService'
import { listEnrollments } from '../../classes/services/enrollmentService'
import type { ClassWithId, EnrollmentWithId } from '../../classes/types'
import { getQuiz, updateQuiz } from '../services/quizService'
import { listQuizAttempts } from '../services/attemptService'
import { listResults } from '../services/resultService'
import { watchQuestionPairs, type SavedQuestion } from '../services/questionService'
import type { QuizRecord } from '../services/quizService'
import type { QuizResult } from '../types'
import { buildRosterRows, computeTimeSpent, isLate, resultsCsv, summarizeAttempts, typedWrongAnswerCounts, type AttemptResult, type ResultListRow } from './resultLogic'
import { AttemptDetail } from './AttemptDetail'

type SortMode = 'recent' | 'student' | 'score'

export function QuizResultsPage() {
  const { quizId = '' } = useParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [attempts, setAttempts] = useState<AttemptResult[]>([])
  const [questions, setQuestions] = useState<SavedQuestion[]>([])
  const [classroom, setClassroom] = useState<ClassWithId | null>(null)
  const [enrollments, setEnrollments] = useState<EnrollmentWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('recent')
  const [selected, setSelected] = useState<AttemptResult | null>(null)
  const [releasePrompt, setReleasePrompt] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    if (!user) return null
    const found = await getQuiz(quizId)
    if (!found || found.ownerId !== user.uid) throw new Error('These results are only available to the quiz owner.')
    const [rawAttempts, rawResults, rawQuestions] = await Promise.all([
      listQuizAttempts(quizId),
      listResults(quizId),
      new Promise<SavedQuestion[]>((resolve, reject) => {
        let stop = () => {}
        stop = watchQuestionPairs(quizId, (items) => { stop(); resolve(items) }, (reason) => { stop(); reject(reason) })
      }),
    ])
    const resultsMap = new Map(rawResults.map((item) => [item.id, item]))
    const joined = rawAttempts.map((attempt) => ({
      ...attempt,
      result: attempt.status === 'submitted' ? (resultsMap.get(attempt.id) ?? null) : null,
    }))
    const [linkedClass, classEnrollments] = found.classId
      ? await Promise.all([getClass(found.classId), listEnrollments(found.classId, found.ownerId)])
      : [null, []]
    return { quiz: found, attempts: joined, questions: rawQuestions, classroom: linkedClass, enrollments: classEnrollments }
  }, [quizId, user])

  useEffect(() => {
    let active = true
    void load().then((data) => {
      if (!active || !data) return
      setError(''); setQuiz(data.quiz); setAttempts(data.attempts); setQuestions(data.questions); setClassroom(data.classroom); setEnrollments(data.enrollments)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Results could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  const visible = useMemo(() => {
    const filtered = buildRosterRows(enrollments, attempts).filter((row) => row.userName.toLowerCase().includes(search.toLowerCase()) || row.userId.toLowerCase().includes(search.toLowerCase()))
    return filtered.sort((a, b) => compareResultRows(a, b, sort))
  }, [attempts, enrollments, search, sort])
  const summary = summarizeAttempts(attempts, quiz?.mode === 'flashcards', quiz?.settings.timeLimitMinutes)

  async function releaseScores(value: boolean) {
    if (!quiz) return
    try {
      const settings = { ...quiz.settings, scoresReleased: value }
      await updateQuiz(quiz.id, { settings })
      setQuiz({ ...quiz, settings }); showToast('success', value ? 'Scores released to students.' : 'Score release turned off.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Score release could not be updated.') }
    finally { setReleasePrompt(null) }
  }

  function exportCsv() {
    try {
      const blob = new Blob([resultsCsv(attempts, quiz?.mode === 'flashcards', classroom?.name ?? 'Unassigned', quiz?.settings.timeLimitMinutes)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = `${quiz?.title || 'quiz'}-results.csv`; link.click(); URL.revokeObjectURL(url)
      showToast('success', 'Results CSV downloaded.')
    } catch { showToast('error', 'The results CSV could not be downloaded.') }
  }

  if (loading) return <AppShell><main className="app-shell__content grid gap-4"><Skeleton label="Loading quiz results" className="h-40 rounded-3xl" /><Skeleton label="Loading submissions" className="h-96 rounded-3xl" /></main></AppShell>
  if (error || !quiz) return <AppShell><PageHeader eyebrow="QUIZ RESULTS" title="Results unavailable." subtitle="We couldn’t load this quiz’s submissions." /><main className="app-shell__content"><Alert tone="error" label="Results unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(''); void load().then((data) => { if (data) { setQuiz(data.quiz); setAttempts(data.attempts); setQuestions(data.questions); setClassroom(data.classroom); setEnrollments(data.enrollments) } }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Results could not be loaded.')).finally(() => setLoading(false)) }}>Retry</Button>}>{error}</Alert></main></AppShell>

  return <AppShell>
    <PageHeader eyebrow="INSTRUCTOR · RESULTS" title={quiz.title || 'Quiz results'} subtitle="Review submissions, question performance and score release." action={<Button type="button" variant="secondary" onClick={exportCsv}><Download size={17} aria-hidden="true" /> Export CSV</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      <p className="m-0"><Badge>Class · {classroom?.name ?? 'Unassigned quiz'}</Badge></p>
      {quiz.settings.scoreVisibility === 'after_release' && <SectionCard title="Score release" description="Students can see their results after you release them. You can turn release off again at any time."><Switch checked={quiz.settings.scoresReleased} onChange={(event) => setReleasePrompt(event.currentTarget.checked)} label="Release scores to students" hint={quiz.settings.scoresReleased ? 'Scores are visible to students now.' : 'Scores are currently held back.'} /></SectionCard>}
      <StatRow><StatTile variant="navy" label="Submissions" value={String(summary.submissions)} hint={`${summary.inProgress} in progress · ${summary.submitted} submitted`} /><StatTile label="Late submissions" value={String(summary.lateSubmissions)} hint={quiz.settings.timeLimitMinutes ? `${quiz.settings.timeLimitMinutes} min limit` : 'No time limit'} /><StatTile label="Average score" value={summary.average === null ? '—' : `${summary.average}%`} hint={quiz.mode === 'flashcards' ? 'Flashcards are not graded' : `Across ${summary.bestStudentCount} students’ best attempts`} /><StatTile label="Highest" value={summary.highest === null ? '—' : `${summary.highest}%`} hint="Best student result" /><StatTile label="Lowest" value={summary.lowest === null ? '—' : `${summary.lowest}%`} hint="Best student result" /><StatTile label="Completion" value={`${summary.inProgress} / ${summary.submitted}`} hint="In progress / submitted" /></StatRow>
      <section className="grid gap-4" aria-labelledby="submission-heading"><header className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="submission-heading" className="m-0 font-heading text-2xl">Submissions</h2><p className="m-0">Each attempt is listed; summary scores use each student’s best attempt.</p></div></header>
        <div className="grid gap-3 md:grid-cols-2"><Input label="Search students" name="results-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" /><Select label="Sort submissions" name="results-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} options={[{ value: 'recent', label: 'Recently submitted' }, { value: 'student', label: 'Student name' }, { value: 'score', label: 'Score' }]} /></div>
        {visible.length === 0 && attempts.length === 0 && !enrollments.some((item) => item.status === 'active') ? <EmptyState title="No submissions yet" description="Student attempts will appear here after they submit this quiz." /> : visible.length === 0 ? <p role="status">No submissions match this search.</p> : <>
          <DataTable label="Quiz submissions" rows={visible} getRowId={(row) => row.attempt?.id ?? row.userId} columns={[
            { key: 'student', header: 'Student', cell: (row) => <>{row.userName}<MembershipBadge row={row} /></>, sortValue: (row) => row.userName },
            { key: 'attempt', header: 'Attempt', cell: (row) => row.attempt?.attemptNumber ?? '—', sortValue: (row) => row.attempt?.attemptNumber ?? 0 },
            { key: 'status', header: 'Status', cell: (row) => {
              if (!row.attempt) return <Badge>Not started</Badge>
              const lateInfo = row.attempt.status === 'submitted' && isLate(row.attempt.startedAt, row.attempt.submittedAt, quiz.settings.timeLimitMinutes)
              return <div className="flex flex-wrap items-center gap-1.5"><Badge>{row.attempt.status === 'submitted' ? 'Submitted' : 'In progress'}</Badge>{lateInfo && lateInfo.late && <Badge className="inline-flex items-center gap-1"><Clock3 size={12} aria-hidden="true" /> Late</Badge>}</div>
            }, sortValue: (row) => row.attempt?.status ?? 'not started' },
            { key: 'score', header: 'Score', cell: (row) => row.attempt ? scoreLabel(row.attempt, quiz.mode === 'flashcards') : '—', sortValue: (row) => row.attempt?.result?.score ?? -1 },
            { key: 'duration', header: 'Time spent', cell: (row) => {
              if (!row.attempt || row.attempt.status !== 'submitted') return '—'
              const seconds = computeTimeSpent(row.attempt.startedAt, row.attempt.submittedAt)
              return seconds !== null ? formatDuration(seconds) : '—'
            }, sortValue: (row) => {
              if (!row.attempt || row.attempt.status !== 'submitted') return -1
              return computeTimeSpent(row.attempt.startedAt, row.attempt.submittedAt) ?? -1
            } },
            { key: 'submitted', header: 'Submitted', cell: (row) => {
              if (!row.attempt) return '—'
              const lateInfo = row.attempt.status === 'submitted' ? isLate(row.attempt.startedAt, row.attempt.submittedAt, quiz.settings.timeLimitMinutes) : { late: false, lateBySeconds: 0 }
              return <div><span>{row.attempt.submittedAt?.toDate().toLocaleString() ?? '—'}</span>{lateInfo.late && <small className="block text-sm font-semibold text-navy-700">Late by {Math.max(1, Math.round(lateInfo.lateBySeconds / 60))} min</small>}</div>
            }, sortValue: (row) => row.attempt?.submittedAt?.toMillis() ?? 0 },
            { key: 'review', header: 'Action', cell: (row) => row.attempt && <Button type="button" variant="secondary" disabled={row.attempt.status !== 'submitted'} onClick={() => setSelected(row.attempt!)}><Eye size={16} aria-hidden="true" /> Review</Button> },
          ]} />
        </>}
      </section>
      {(quiz.mode === 'quiz' || quiz.mode === 'canvas') && <QuestionAnalytics questions={questions} attempts={attempts} />}
    </main>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Attempt detail" description={selected ? `${selected.userName || selected.userId} · Attempt ${selected.attemptNumber}` : undefined} className="dialog--wide">
      {selected && <AttemptDetail quizId={quizId} attempt={selected} questions={questions} ungraded={quiz.mode === 'flashcards'} timeLimitMinutes={quiz.settings.timeLimitMinutes} onGradeChanged={(result: QuizResult) => { setAttempts((items) => items.map((item) => item.id === selected.id ? { ...item, result } : item)); setSelected({ ...selected, result }) }} />}
    </Dialog>
    <ConfirmDialog open={releasePrompt !== null} onClose={() => setReleasePrompt(null)} onConfirm={() => { if (releasePrompt !== null) void releaseScores(releasePrompt) }} title={releasePrompt ? 'Release scores to students?' : 'Turn off score release?'} description={releasePrompt ? 'Students will be able to see their scores according to this quiz’s answer settings.' : 'Students will no longer be able to see scores until you release them again.'} confirmLabel={releasePrompt ? 'Release scores' : 'Turn off release'} />
  </AppShell>
}

function scoreLabel(item: AttemptResult, ungraded: boolean) { return ungraded ? 'Self-rated' : item.result ? `${item.result.score} / ${item.result.maxScore}` : 'Awaiting grade' }
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}m ${seconds % 60}s` }
function compareResultRows(a: ResultListRow, b: ResultListRow, sort: SortMode) {
  if (sort === 'student') return a.userName.localeCompare(b.userName)
  if (sort === 'score') return (b.attempt?.result?.score ?? -1) - (a.attempt?.result?.score ?? -1)
  return (b.attempt?.submittedAt?.toMillis() ?? b.attempt?.startedAt.toMillis() ?? 0) - (a.attempt?.submittedAt?.toMillis() ?? a.attempt?.startedAt.toMillis() ?? 0)
}
function MembershipBadge({ row }: { row: ResultListRow }) {
  if (row.membership === 'enrolled') return null
  return <span className="ml-2 inline-flex"><Badge>{row.membership === 'no_longer_enrolled' ? 'No longer enrolled' : 'Enrolled · not started'}</Badge></span>
}

function QuestionAnalytics({ questions, attempts }: { questions: SavedQuestion[]; attempts: AttemptResult[] }) {
  const submitted = attempts.filter((item) => item.status === 'submitted' && item.result)
  const rows = questions.map(({ id, question, answerKey }) => {
    const grades = submitted.flatMap((item) => item.result?.perQuestion[id] ? [item.result.perQuestion[id]] : [])
    const correct = grades.filter(({ correct: value }) => value === true).length
    return { id, question, answerKey, percent: grades.length ? Math.round(correct / grades.length * 100) : null, missed: grades.length - correct,
      wrong: typedWrongAnswerCounts({ question: { ...question, id }, key: answerKey, attempts: submitted }) }
  }).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
  return <SectionCard title="Question analytics" description="Questions are ordered from most missed to least missed.">
    {rows.length === 0 ? <p className="m-0">Add questions to see analytics.</p> : <ol className="question-analytics">{rows.map((row) => <li key={row.id} className="question-analytics__card"><strong>{row.question.prompt}</strong><p className="m-0">{row.percent === null ? 'No graded submissions' : `${row.percent}% correct · ${row.missed} missed`}</p><progress className="question-analytics__track" max={100} value={row.percent ?? 0} aria-label={`${row.question.prompt} correct rate`} />{row.wrong.length > 0 && <p className="m-0">Common typed answers: {row.wrong.map(({ answer, count }) => `“${answer}” (${count})`).join(', ')}</p>}</li>)}</ol>}
  </SectionCard>
}
