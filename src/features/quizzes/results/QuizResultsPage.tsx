import { Download, Eye } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataCard } from '../../../shared/ui/DataCard'
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
import { getQuiz, updateQuiz } from '../services/quizService'
import { listQuizAttempts } from '../services/attemptService'
import { getQuizResult } from '../services/resultService'
import { watchQuestionPairs, type SavedQuestion } from '../services/questionService'
import type { QuizRecord } from '../services/quizService'
import type { QuizResult } from '../types'
import { resultsCsv, summarizeAttempts, typedWrongAnswerCounts, type AttemptResult } from './resultLogic'
import { AttemptDetail } from './AttemptDetail'

type SortMode = 'recent' | 'student' | 'score'

export function QuizResultsPage() {
  const { quizId = '' } = useParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [attempts, setAttempts] = useState<AttemptResult[]>([])
  const [questions, setQuestions] = useState<SavedQuestion[]>([])
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
    const [rawAttempts, rawQuestions] = await Promise.all([listQuizAttempts(quizId), new Promise<SavedQuestion[]>((resolve, reject) => {
      let stop = () => {}
      stop = watchQuestionPairs(quizId, (items) => { stop(); resolve(items) }, (reason) => { stop(); reject(reason) })
    })])
    const joined = await Promise.all(rawAttempts.map(async (attempt) => ({ ...attempt, result: attempt.status === 'submitted' ? await getQuizResult(quizId, attempt.id) : null })))
    return { quiz: found, attempts: joined, questions: rawQuestions }
  }, [quizId, user])

  useEffect(() => {
    let active = true
    void load().then((data) => {
      if (!active || !data) return
      setError(''); setQuiz(data.quiz); setAttempts(data.attempts); setQuestions(data.questions)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Results could not be loaded.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load])

  const visible = useMemo(() => {
    const filtered = attempts.filter((item) => item.userName.toLowerCase().includes(search.toLowerCase()) || item.userId.toLowerCase().includes(search.toLowerCase()))
    return filtered.sort((a, b) => sort === 'student' ? a.userName.localeCompare(b.userName) : sort === 'score' ? (b.result?.score ?? -1) - (a.result?.score ?? -1) : (b.submittedAt?.toMillis() ?? b.startedAt.toMillis()) - (a.submittedAt?.toMillis() ?? a.startedAt.toMillis()))
  }, [attempts, search, sort])
  const summary = summarizeAttempts(attempts, quiz?.mode === 'flashcards')

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
      const blob = new Blob([resultsCsv(attempts, quiz?.mode === 'flashcards')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = `${quiz?.title || 'quiz'}-results.csv`; link.click(); URL.revokeObjectURL(url)
      showToast('success', 'Results CSV downloaded.')
    } catch { showToast('error', 'The results CSV could not be downloaded.') }
  }

  if (loading) return <AppShell><main className="app-shell__content grid gap-4"><Skeleton label="Loading quiz results" className="h-40 rounded-3xl" /><Skeleton label="Loading submissions" className="h-96 rounded-3xl" /></main></AppShell>
  if (error || !quiz) return <AppShell><PageHeader eyebrow="QUIZ RESULTS" title="Results unavailable." subtitle="We couldn’t load this quiz’s submissions." /><main className="app-shell__content"><Alert tone="error" label="Results unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(''); void load().then((data) => { if (data) { setQuiz(data.quiz); setAttempts(data.attempts); setQuestions(data.questions) } }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Results could not be loaded.')).finally(() => setLoading(false)) }}>Retry</Button>}>{error}</Alert></main></AppShell>

  return <AppShell>
    <PageHeader eyebrow="INSTRUCTOR · RESULTS" title={quiz.title || 'Quiz results'} subtitle="Review submissions, question performance and score release." action={<Button type="button" variant="secondary" onClick={exportCsv}><Download size={17} aria-hidden="true" /> Export CSV</Button>} />
    <main className="app-shell__content grid gap-6" id="main-content">
      {quiz.settings.scoreVisibility === 'after_release' && <SectionCard title="Score release" description="Students can see their results after you release them. You can turn release off again at any time."><Switch checked={quiz.settings.scoresReleased} onChange={(event) => setReleasePrompt(event.currentTarget.checked)} label="Release scores to students" hint={quiz.settings.scoresReleased ? 'Scores are visible to students now.' : 'Scores are currently held back.'} /></SectionCard>}
      <StatRow><StatTile label="Submissions" value={String(summary.submissions)} hint={`${summary.inProgress} in progress · ${summary.submitted} submitted`} /><StatTile label="Average score" value={summary.average === null ? '—' : `${summary.average}%`} hint={quiz.mode === 'flashcards' ? 'Flashcards are not graded' : `Across ${summary.bestStudentCount} students’ best attempts`} /><StatTile label="Highest" value={summary.highest === null ? '—' : `${summary.highest}%`} hint="Best student result" /><StatTile label="Lowest" value={summary.lowest === null ? '—' : `${summary.lowest}%`} hint="Best student result" /><StatTile label="Completion" value={`${summary.inProgress} / ${summary.submitted}`} hint="In progress / submitted" /></StatRow>
      <section className="grid gap-4" aria-labelledby="submission-heading"><header className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="submission-heading" className="m-0 font-heading text-2xl">Submissions</h2><p className="m-0">Each attempt is listed; summary scores use each student’s best attempt.</p></div></header>
        <div className="grid gap-3 md:grid-cols-2"><Input label="Search students" name="results-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" /><Select label="Sort submissions" name="results-sort" value={sort} onChange={(event) => setSort(event.target.value as SortMode)} options={[{ value: 'recent', label: 'Recently submitted' }, { value: 'student', label: 'Student name' }, { value: 'score', label: 'Score' }]} /></div>
        {attempts.length === 0 ? <EmptyState title="No submissions yet" description="Student attempts will appear here after they submit this quiz." /> : visible.length === 0 ? <p role="status">No submissions match this search.</p> : <>
          <div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><caption className="sr-only">Quiz submissions</caption><thead><tr>{['Student', 'Attempt', 'Status', 'Score', 'Time spent', 'Submitted', ''].map((heading) => <th key={heading} scope="col" className="border-b border-navy/20 px-3 py-3">{heading}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-navy/10"><td className="px-3 py-3">{item.userName || item.userId}</td><td className="px-3 py-3">{item.attemptNumber}</td><td className="px-3 py-3"><Badge>{item.status === 'submitted' ? 'Submitted' : 'In progress'}</Badge></td><td className="px-3 py-3">{scoreLabel(item, quiz.mode === 'flashcards')}</td><td className="px-3 py-3">{formatDuration(item.timeSpentSeconds)}</td><td className="px-3 py-3">{item.submittedAt?.toDate().toLocaleString() ?? '—'}</td><td className="px-3 py-3"><Button type="button" variant="secondary" disabled={item.status !== 'submitted'} onClick={() => setSelected(item)}><Eye size={16} aria-hidden="true" /> Review</Button></td></tr>)}</tbody></table></div>
          <div className="grid gap-3 md:hidden">{visible.map((item) => <DataCard key={item.id} title={item.userName || item.userId} meta={`Attempt ${item.attemptNumber} · ${formatDuration(item.timeSpentSeconds)} · ${item.submittedAt?.toDate().toLocaleString() ?? 'Not submitted'}`} badge={<Badge>{item.status === 'submitted' ? 'Submitted' : 'In progress'}</Badge>}><p className="m-0">Score: {scoreLabel(item, quiz.mode === 'flashcards')}</p><Button type="button" variant="secondary" disabled={item.status !== 'submitted'} onClick={() => setSelected(item)}><Eye size={16} aria-hidden="true" /> Review attempt</Button></DataCard>)}</div>
        </>}
      </section>
      {quiz.mode === 'quiz' && <QuestionAnalytics questions={questions} attempts={attempts} />}
    </main>
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title="Attempt detail" description={selected ? `${selected.userName || selected.userId} · Attempt ${selected.attemptNumber}` : undefined} className="dialog--wide">
      {selected && <AttemptDetail quizId={quizId} attempt={selected} questions={questions} ungraded={quiz.mode === 'flashcards'} onGradeChanged={(result: QuizResult) => { setAttempts((items) => items.map((item) => item.id === selected.id ? { ...item, result } : item)); setSelected({ ...selected, result }) }} />}
    </Dialog>
    <ConfirmDialog open={releasePrompt !== null} onClose={() => setReleasePrompt(null)} onConfirm={() => { if (releasePrompt !== null) void releaseScores(releasePrompt) }} title={releasePrompt ? 'Release scores to students?' : 'Turn off score release?'} description={releasePrompt ? 'Students will be able to see their scores according to this quiz’s answer settings.' : 'Students will no longer be able to see scores until you release them again.'} confirmLabel={releasePrompt ? 'Release scores' : 'Turn off release'} />
  </AppShell>
}

function scoreLabel(item: AttemptResult, ungraded: boolean) { return ungraded ? 'Self-rated' : item.result ? `${item.result.score} / ${item.result.maxScore}` : 'Awaiting grade' }
function formatDuration(seconds: number) { return `${Math.floor(seconds / 60)}m ${seconds % 60}s` }

function QuestionAnalytics({ questions, attempts }: { questions: SavedQuestion[]; attempts: AttemptResult[] }) {
  const submitted = attempts.filter((item) => item.status === 'submitted' && item.result)
  const rows = questions.map(({ id, question, answerKey }) => {
    const grades = submitted.flatMap((item) => item.result?.perQuestion[id] ? [item.result.perQuestion[id]] : [])
    const correct = grades.filter(({ correct: value }) => value === true).length
    return { id, question, answerKey, percent: grades.length ? Math.round(correct / grades.length * 100) : null, missed: grades.length - correct,
      wrong: typedWrongAnswerCounts({ question: { ...question, id }, key: answerKey, attempts: submitted }) }
  }).sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
  return <SectionCard title="Question analytics" description="Questions are ordered from most missed to least missed.">
    {rows.length === 0 ? <p className="m-0">Add questions to see analytics.</p> : <ol className="grid gap-4 pl-5">{rows.map((row) => <li key={row.id}><strong>{row.question.prompt}</strong><p className="m-0">{row.percent === null ? 'No graded submissions' : `${row.percent}% correct · ${row.missed} missed`}</p>{row.wrong.length > 0 && <p className="m-0">Common typed answers: {row.wrong.map(({ answer, count }) => `“${answer}” (${count})`).join(', ')}</p>}</li>)}</ol>}
  </SectionCard>
}
