import { Archive, BarChart3, Copy, Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../../shared/ui/Alert'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { Dialog } from '../../shared/ui/Dialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { resolveListStatus } from '../../shared/ui/listState'
import { Select } from '../../shared/ui/Select'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { archiveQuiz, countQuizAttempts, deleteQuizCascade, duplicateQuiz, publishQuiz, restoreQuiz, unpublishQuiz, type QuizRecord } from '../quizzes/services'
import { quizModeLabel } from '../quizzes/types'
import type { ClassWithId } from './types'
import { copyQuizToClass, watchQuizzesForClass } from './services/quizService'

export function ClassQuizzesTab({ classroom, classes }: { classroom: ClassWithId; classes: ClassWithId[] }) {
  const { showToast } = useToast()
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copySelection, setCopySelection] = useState<QuizRecord | null>(null)
  const [targetClass, setTargetClass] = useState('')
  const [deleteSelection, setDeleteSelection] = useState<{ quiz: QuizRecord; submissions: number } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const targets = useMemo(() => classes.filter((item) => item.status === 'active' && item.id !== classroom.id), [classes, classroom.id])

  useEffect(() => {
    return watchQuizzesForClass(classroom.id, classroom.ownerId, (items) => { setQuizzes(items); setLoading(false) }, (reason) => { setError(reason.message); setLoading(false) })
  }, [classroom.id, classroom.ownerId, retry])

  async function action(id: string, success: string, run: () => Promise<unknown>) {
    setBusyId(id)
    try { await run(); showToast('success', success) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The action could not be completed.') }
    finally { setBusyId(null) }
  }

  async function startDelete(quiz: QuizRecord) {
    setDeleteBusy(true)
    try { setDeleteSelection({ quiz, submissions: await countQuizAttempts(quiz.id) }) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Could not check submissions.') }
    finally { setDeleteBusy(false) }
  }

  async function remove() {
    if (!deleteSelection) return
    await action(deleteSelection.quiz.id, `“${deleteSelection.quiz.title}” and its submissions were deleted.`, () => deleteQuizCascade(deleteSelection.quiz.id))
    setDeleteSelection(null)
  }

  async function copyToClass() {
    if (!copySelection || !targetClass) return
    await action(copySelection.id, 'Draft copy created in the selected class.', () => copyQuizToClass(copySelection.id, targetClass))
    setCopySelection(null)
  }

  return <section className="grid gap-5" aria-labelledby="class-quizzes-heading">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><span className="section-kicker">CLASS PRACTICE</span><h2 id="class-quizzes-heading" className="m-0 text-2xl">Quizzes and Activities</h2></div>{classroom.status === 'active' ? <Button to={`/instructor/quizzes/new?classId=${encodeURIComponent(classroom.id)}`}><Plus size={16} aria-hidden="true" /> Create quiz</Button> : <Button type="button" disabled aria-label="Restore this class before creating quizzes">Restore this class before creating quizzes</Button>}</header>
    {(() => {
      const status = resolveListStatus({ loading, error, count: quizzes.length })
      if (status === 'error') {
        return <Alert tone="error" label="Quizzes unavailable" action={<Button type="button" variant="secondary" onClick={() => { setLoading(true); setError(null); setRetry((value) => value + 1) }}>Retry</Button>}>{error}</Alert>
      }
      if (status === 'loading') {
        return <div className="grid gap-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-36 rounded-3xl" label="Loading class quiz" />)}</div>
      }
      if (status === 'empty') {
        return <EmptyState title="No quizzes in this class yet" description="Create a quiz to give this class a focused place to practice." action={classroom.status === 'active' ? <Button to={`/instructor/quizzes/new?classId=${encodeURIComponent(classroom.id)}`}><Plus size={16} aria-hidden="true" /> Create quiz</Button> : <Button type="button" disabled>Restore class to create a quiz</Button>} />
      }
      return <div className="grid gap-3">{quizzes.map((quiz) => <DataCard key={quiz.id} title={quiz.title || 'Untitled quiz'} meta={`${quiz.questionCount} ${quiz.questionCount === 1 ? 'question' : 'questions'} · Updated ${quiz.updatedAt.toDate().toLocaleDateString(undefined, { dateStyle: 'medium' })}`} badge={<div className="flex gap-2"><Badge>{quiz.status}</Badge><Badge>{quizModeLabel(quiz.mode)}</Badge></div>}>
        <p className="m-0 flex flex-wrap gap-2 text-sm text-navy-800-72"><span>{quiz.settings.participation.type === 'group' ? `Group of ${quiz.settings.participation.groupSize}` : 'Individual'}</span><span>{quiz.settings.answerReveal === 'never' ? 'Answers hidden' : quiz.settings.answerReveal === 'after_each' ? 'Answers after each question' : 'Answers after submission'}</span><span>{quiz.settings.timeLimitMinutes ? `${quiz.settings.timeLimitMinutes} minutes` : 'Untimed'}</span></p>
        <div className="flex flex-wrap gap-2">
          <Button to={`/instructor/quizzes/${quiz.id}`}>Edit</Button>
          <Button to={`/instructor/quizzes/${quiz.id}/results`} variant="secondary"><BarChart3 size={15} aria-hidden="true" /> Results</Button>
          <Button type="button" variant="secondary" disabled={busyId === quiz.id || deleteBusy} onClick={() => void action(quiz.id, 'Draft copy created.', () => duplicateQuiz(quiz.id))}><Copy size={15} aria-hidden="true" /> Duplicate</Button>
          {targets.length ? <Button type="button" variant="secondary" disabled={busyId === quiz.id || deleteBusy} onClick={() => { setCopySelection(quiz); setTargetClass(targets[0].id) }}><Copy size={15} aria-hidden="true" /> Copy to another class</Button> : <Link to="/instructor" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-900-12 px-4 text-sm font-semibold text-navy-800 no-underline">Create another active class to copy</Link>}
          {quiz.status === 'published' ? <Button type="button" variant="secondary" disabled={busyId === quiz.id} onClick={() => void action(quiz.id, 'Quiz returned to draft.', () => unpublishQuiz(quiz.id))}><Send size={15} aria-hidden="true" /> Unpublish</Button> : <Button type="button" variant="secondary" disabled={busyId === quiz.id || classroom.status !== 'active' || quiz.questionCount < 1 || !quiz.title.trim()} title={classroom.status !== 'active' ? 'Restore this class first' : quiz.questionCount < 1 || !quiz.title.trim() ? 'Add a title and at least one question first' : undefined} onClick={() => void action(quiz.id, 'Quiz published.', () => publishQuiz(quiz.id))}><Send size={15} aria-hidden="true" /> Publish</Button>}
          {quiz.status === 'archived' ? <Button type="button" variant="secondary" disabled={busyId === quiz.id} onClick={() => void action(quiz.id, 'Quiz restored to drafts.', () => restoreQuiz(quiz.id))}><RotateCcw size={15} aria-hidden="true" /> Restore</Button> : <Button type="button" variant="secondary" disabled={busyId === quiz.id} onClick={() => void action(quiz.id, 'Quiz archived.', () => archiveQuiz(quiz.id))}><Archive size={15} aria-hidden="true" /> Archive</Button>}
          <Button type="button" variant="secondary" disabled={deleteBusy || busyId === quiz.id} onClick={() => void startDelete(quiz)}><Trash2 size={15} aria-hidden="true" /> Delete</Button>
        </div>
      </DataCard>)}</div>
    })()}

    <Dialog open={Boolean(copySelection)} onClose={() => setCopySelection(null)} title="Copy quiz to another class" description={copySelection ? `Create a separate draft of “${copySelection.title}”.` : undefined}>
      {targets.length ? <><Select label="Destination class" name="copy-target-class" value={targetClass} onChange={(event) => setTargetClass(event.target.value)} options={targets.map((item) => ({ value: item.id, label: item.name }))} /><div className="dialog__actions"><Button type="button" variant="secondary" onClick={() => setCopySelection(null)}>Cancel</Button><Button type="button" onClick={() => void copyToClass()} disabled={!targetClass || busyId === copySelection?.id}>Copy quiz</Button></div></> : <><p>You need another active class before you can copy this quiz.</p><Link to="/instructor" className="text-navy-800 underline">Create a class</Link></>}
    </Dialog>
    <ConfirmDialog open={Boolean(deleteSelection)} onClose={() => setDeleteSelection(null)} onConfirm={() => void remove()} title="Delete this quiz?" description={deleteSelection ? `This erases ${deleteSelection.submissions} student ${deleteSelection.submissions === 1 ? 'submission' : 'submissions'} and all quiz content. Archive the quiz if you may want it later.` : ''} requiredName={deleteSelection?.quiz.title} confirmLabel="Delete quiz" />
  </section>
}
