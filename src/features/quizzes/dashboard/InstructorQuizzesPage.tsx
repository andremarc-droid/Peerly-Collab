import { Archive, BarChart3, Copy, MoreVertical, Pencil, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { DataCard } from '../../../shared/ui/DataCard'
import { DropdownMenu } from '../../../shared/ui/DropdownMenu'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { resolveListStatus } from '../../../shared/ui/listState'
import { Select } from '../../../shared/ui/Select'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { StatRow, StatTile } from '../../../shared/ui/StatTile'
import { Toolbar } from '../../../shared/ui/Toolbar'
import { useToast } from '../../../shared/ui/useToast'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import { archiveQuiz, duplicateQuiz, publishQuiz, restoreQuiz, unpublishQuiz, watchOwnerQuizzes, type QuizRecord } from '../services'
import { countQuizAttempts, deleteQuizCascade } from '../services/deleteQuizCascade'
import { quizModeLabel } from '../types'
import { filterAndSortQuizzes, type QuizFilter, type QuizModeFilter, type QuizSort } from './quizList'

interface DeleteSelection { quiz: QuizRecord; submissions: number }

/** Phones and tablets. Desktop (1024px and up) keeps the full button row. */
const COMPACT_QUERY = '(max-width: 1023px)'

function useCompactViewport() {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const media = window.matchMedia(COMPACT_QUERY)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  )
}

function settingBadges(quiz: QuizRecord) {
  const { settings, mode } = quiz
  if (mode === 'canvas') {
    return [
      quiz.questionCount > 0 ? 'Board ready' : 'Add cards and connections',
      settings.participation.type === 'group' ? `Group of ${settings.participation.groupSize}` : 'Individual',
      settings.timeLimitMinutes ? `${settings.timeLimitMinutes} min` : null,
      settings.attemptsAllowed ? `${settings.attemptsAllowed} ${settings.attemptsAllowed === 1 ? 'attempt' : 'attempts'}` : 'Unlimited attempts',
    ].filter(Boolean)
  }
  return [
    settings.answerReveal === 'after_each' ? 'Answers after each question' : settings.answerReveal === 'after_submit' ? 'Answers after quiz' : 'Answers hidden',
    settings.participation.type === 'group' ? `Group of ${settings.participation.groupSize}` : 'Individual',
    settings.timeLimitMinutes ? `${settings.timeLimitMinutes} min` : null,
    settings.attemptsAllowed ? `${settings.attemptsAllowed} ${settings.attemptsAllowed === 1 ? 'attempt' : 'attempts'}` : 'Unlimited attempts',
  ].filter(Boolean)
}

export function InstructorQuizzesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<QuizModeFilter>('all')
  const [status, setStatus] = useState<QuizFilter>('all')
  const [sort, setSort] = useState<QuizSort>('recent')
  const [classFilter, setClassFilter] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deleteSelection, setDeleteSelection] = useState<DeleteSelection | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    return watchOwnerQuizzes(user.uid, (items) => { setQuizzes(items); setLoading(false) }, (reason) => { setError(reason.message); setLoading(false) })
  }, [user, refresh])

  useEffect(() => {
    if (!user) return undefined
    return watchMyClasses(user.uid, setClasses, (reason) => showToast('error', reason.message))
  }, [user, showToast])

  const visible = useMemo(
    () => filterAndSortQuizzes(quizzes, search, status, sort, classFilter, typeFilter),
    [quizzes, search, status, sort, classFilter, typeFilter],
  )
  const published = quizzes.filter((quiz) => quiz.status === 'published').length
  const drafts = quizzes.filter((quiz) => quiz.status === 'draft').length

  async function runAction(id: string, label: string, action: () => Promise<unknown>) {
    setBusyId(id)
    try { await action(); showToast('success', label) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The action could not be completed.') }
    finally { setBusyId(null) }
  }

  async function beginDelete(quiz: QuizRecord) {
    setDeleteLoading(true)
    try { setDeleteSelection({ quiz, submissions: await countQuizAttempts(quiz.id) }) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Could not check quiz submissions.') }
    finally { setDeleteLoading(false) }
  }

  async function removeQuiz() {
    if (!deleteSelection) return
    const { quiz } = deleteSelection
    setBusyId(quiz.id)
    try { await deleteQuizCascade(quiz.id); showToast('success', `“${quiz.title}” and its submissions were deleted.`) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The quiz could not be deleted.') }
    finally { setBusyId(null); setDeleteSelection(null) }
  }

  return <AppShell>
    <PageHeader eyebrow="INSTRUCTOR LIBRARY" title="All quizzes." subtitle="Find every class quiz and draft from one place." action={classes.some((item) => item.status === 'active') ? <Button to="/instructor/quizzes/new"><Plus size={18} aria-hidden="true" /> Create quiz</Button> : <Button to="/instructor"><Plus size={18} aria-hidden="true" /> Create a class first</Button>} />
    <main className="app-shell__content quiz-dashboard" id="main-content">
      <StatRow><StatTile label="Quizzes" value={String(quizzes.length)} hint="All quizzes in your library" /><StatTile label="Published" value={String(published)} hint="Visible in the learner catalog" /><StatTile label="Drafts" value={String(drafts)} hint="Still being prepared" /></StatRow>
      <section className="dashboard-section" aria-labelledby="quiz-library-title">
        <header className="dashboard-section__heading"><div><span className="section-kicker">YOUR LIBRARY</span><h2 id="quiz-library-title">All quizzes</h2></div><span className="dashboard-section__count">{visible.length} {visible.length === 1 ? 'quiz' : 'quizzes'}</span></header>
        <Toolbar query={search} onQueryChange={setSearch} placeholder="Search by title" filters={<>
          <Select label="Type" name="quiz-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as QuizModeFilter)} options={[{ label: 'All', value: 'all' }, { label: 'Quiz', value: 'quiz' }, { label: 'Flashcards', value: 'flashcards' }, { label: 'Canvas', value: 'canvas' }]} />
          <Select label="Status" name="quiz-status" value={status} onChange={(event) => setStatus(event.target.value as QuizFilter)} options={[{ label: 'All statuses', value: 'all' }, { label: 'Draft', value: 'draft' }, { label: 'Published', value: 'published' }, { label: 'Archived', value: 'archived' }]} />
          <Select label="Class" name="quiz-class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} options={[{ label: 'All classes', value: 'all' }, ...classes.map((item) => ({ label: item.name, value: item.id })), { label: 'Unassigned legacy', value: 'unassigned' }]} />
          <Select label="Sort" name="quiz-sort" value={sort} onChange={(event) => setSort(event.target.value as QuizSort)} options={[{ label: 'Recently updated', value: 'recent' }, { label: 'Title', value: 'title' }]} />
        </>} />
        {(() => {
          const listStatus = resolveListStatus({ loading, error, count: quizzes.length })
          if (listStatus === 'error') {
            return <Alert tone="error" label="Quizzes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(null); setRefresh((value) => value + 1) }}>Retry</Button>}>{error}</Alert>
          }
          if (listStatus === 'loading') {
            return <div className="quiz-skeleton-list" aria-label="Loading quizzes">{[0, 1, 2].map((item) => <Skeleton key={item} className="quiz-skeleton" label="Loading quiz" />)}</div>
          }
          if (listStatus === 'empty') {
            return <EmptyState title="Your quiz library is ready" description={classes.some((item) => item.status === 'active') ? 'Create your first quiz and begin planning a thoughtful practice session.' : 'Create a class first, then make quizzes for its students.'} action={classes.some((item) => item.status === 'active') ? <Button to="/instructor/quizzes/new"><Plus size={17} aria-hidden="true" /> Create your first quiz</Button> : <Button to="/instructor"><Plus size={17} aria-hidden="true" /> Create your first class</Button>} />
          }
          return visible.length === 0 ? <p className="quiz-empty-filter" role="status">No quizzes match these filters.</p> : <div className="quiz-list">{visible.map((quiz) => <QuizCard key={quiz.id} quiz={quiz} classLabel={quiz.classId ? classes.find((item) => item.id === quiz.classId)?.name ?? 'Assigned class' : 'Unassigned legacy'} busy={busyId === quiz.id || deleteLoading} onAction={runAction} onDelete={() => void beginDelete(quiz)} />)}</div>
        })()}
      </section>
    </main>
    <ConfirmDialog open={Boolean(deleteSelection)} onClose={() => setDeleteSelection(null)} onConfirm={() => void removeQuiz()} title={deleteSelection?.quiz.mode === 'canvas' ? 'Delete this canvas?' : 'Delete this quiz?'} description={deleteSelection ? `Deleting “${deleteSelection.quiz.title}” will permanently erase ${deleteSelection.submissions} student ${deleteSelection.submissions === 1 ? 'submission' : 'submissions'} and all ${deleteSelection.quiz.mode === 'canvas' ? 'canvas' : 'quiz'} content. Archive it instead if you may want it later.` : ''} requiredName={deleteSelection?.quiz.title} confirmLabel={deleteSelection?.quiz.mode === 'canvas' ? 'Delete canvas' : 'Delete quiz'} />
  </AppShell>
}

function QuizCard({ quiz, classLabel, busy, onAction, onDelete }: { quiz: QuizRecord; classLabel: string; busy: boolean; onAction: (id: string, label: string, action: () => Promise<unknown>) => void; onDelete: () => void }) {
  const statusLabel = quiz.status[0].toUpperCase() + quiz.status.slice(1)
  const isCanvas = quiz.mode === 'canvas'
  const updated = quiz.updatedAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })
  const metaStatus = isCanvas
    ? quiz.boardKind === 'blank'
      ? quiz.questionCount > 0
        ? 'Instructions ready'
        : 'Add instructions'
      : quiz.questionCount > 0
      ? 'Board ready'
      : 'Add cards and connections'
    : `${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'}`

  const compact = useCompactViewport()
  const cannotPublish = quiz.status !== 'published' && (quiz.questionCount < 1 || !quiz.title.trim())
  const publishHint = isCanvas ? 'Add a title and save your board before publishing.' : 'Add a title and at least one question before publishing.'
  const publishLabel = cannotPublish ? (isCanvas ? 'Publish (add a title and save your board first)' : 'Publish (add a title and at least one question first)') : 'Publish'
  const compactActions = <div className="quiz-card__actions quiz-card__actions--compact">
    {cannotPublish && <span className="quiz-card__publish-hint">{publishHint}</span>}
    <DropdownMenu label={`Actions for ${quiz.title || 'Untitled quiz'}`} iconOnly trigger={<MoreVertical size={20} aria-hidden="true" />}>
      <Link role="menuitem" to={`/instructor/quizzes/${quiz.id}`}><Pencil size={16} aria-hidden="true" /> Edit</Link>
      <Link role="menuitem" to={`/instructor/quizzes/${quiz.id}/results`}><BarChart3 size={16} aria-hidden="true" /> Results</Link>
      <button type="button" role="menuitem" disabled={busy} onClick={() => onAction(quiz.id, 'Draft copy created.', () => duplicateQuiz(quiz.id))}><Copy size={16} aria-hidden="true" /> Duplicate</button>
      {quiz.status === 'published'
        ? <button type="button" role="menuitem" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas returned to draft.' : 'Quiz returned to draft.', () => unpublishQuiz(quiz.id))}><Send size={16} aria-hidden="true" /> Unpublish</button>
        : <button type="button" role="menuitem" disabled={busy || cannotPublish} aria-label={publishLabel} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas published.' : 'Quiz published.', () => publishQuiz(quiz.id))}><Send size={16} aria-hidden="true" /> Publish</button>}
      {quiz.status === 'archived'
        ? <button type="button" role="menuitem" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas restored to drafts.' : 'Quiz restored to drafts.', () => restoreQuiz(quiz.id))}><RotateCcw size={16} aria-hidden="true" /> Restore</button>
        : <button type="button" role="menuitem" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas archived.' : 'Quiz archived.', () => archiveQuiz(quiz.id))}><Archive size={16} aria-hidden="true" /> Archive</button>}
      <button type="button" role="menuitem" className="is-danger" disabled={busy} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /> Delete</button>
    </DropdownMenu>
  </div>

  return <DataCard title={quiz.title || 'Untitled quiz'} meta={`${metaStatus} · Updated ${updated}`} badge={<div className="quiz-card__badges"><Badge>{statusLabel}</Badge><Badge>{quizModeLabel(quiz.mode)}</Badge>{isCanvas && <Badge>{quiz.boardKind === 'blank' ? 'You grade' : 'Auto-graded'}</Badge>}<Badge>{classLabel}</Badge></div>}>
    <div className="quiz-settings-badges">{settingBadges(quiz).map((label) => <span key={label}>{label}</span>)}</div>
    {compact ? compactActions : <div className="quiz-card__actions">
      <Button to={`/instructor/quizzes/${quiz.id}`}><Pencil size={15} aria-hidden="true" /> Edit</Button>
      <Button to={`/instructor/quizzes/${quiz.id}/results`} variant="secondary"><BarChart3 size={15} aria-hidden="true" /> Results</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction(quiz.id, 'Draft copy created.', () => duplicateQuiz(quiz.id))}><Copy size={15} aria-hidden="true" /> Duplicate</Button>
      {quiz.status === 'published'
        ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas returned to draft.' : 'Quiz returned to draft.', () => unpublishQuiz(quiz.id))}><Send size={15} aria-hidden="true" /> Unpublish</Button>
        : <Button type="button" variant="secondary" disabled={busy || quiz.questionCount < 1 || !quiz.title.trim()} aria-label={quiz.questionCount < 1 || !quiz.title.trim() ? (isCanvas ? 'Publish (add a title and save your board first)' : 'Publish (add a title and at least one question first)') : 'Publish'} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas published.' : 'Quiz published.', () => publishQuiz(quiz.id))}><Send size={15} aria-hidden="true" /> Publish</Button>}
      {quiz.status !== 'published' && (quiz.questionCount < 1 || !quiz.title.trim()) && <span className="quiz-card__publish-hint">{isCanvas ? 'Add a title and save your board before publishing.' : 'Add a title and at least one question before publishing.'}</span>}
      {quiz.status === 'archived'
        ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas restored to drafts.' : 'Quiz restored to drafts.', () => restoreQuiz(quiz.id))}><RotateCcw size={15} aria-hidden="true" /> Restore</Button>
        : <Button type="button" variant="secondary" disabled={busy} onClick={() => onAction(quiz.id, isCanvas ? 'Canvas archived.' : 'Quiz archived.', () => archiveQuiz(quiz.id))}><Archive size={15} aria-hidden="true" /> Archive</Button>}
      <Button type="button" variant="secondary" disabled={busy} className="button--destructive" onClick={onDelete}><Trash2 size={15} aria-hidden="true" /> Delete</Button>
    </div>}
  </DataCard>
}
