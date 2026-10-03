import { BookOpenText, MoveDown, MoveUp, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { watchQuizzesForClass } from '../classes/services/quizService'
import type { ClassWithId } from '../classes/types'
import type { QuizRecord } from '../quizzes/services/quizService'
import { setAttachedQuizzes } from './services'
import type { ModuleWithId } from './types'

export function AttachedQuizzesSection({ classroom, module }: { classroom: ClassWithId; module: ModuleWithId }) {
  const { showToast } = useToast()
  const [quizzes, setQuizzes] = useState<QuizRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const selected = useMemo(() => new Set(module.quizIds), [module.quizIds])
  const ordered = module.quizIds.map((id) => quizzes.find((quiz) => quiz.id === id) ?? null)

  useEffect(() => watchQuizzesForClass(classroom.id, classroom.ownerId, (items) => { setQuizzes(items); setLoading(false); setError('') }, (reason) => { setError(reason.message); setLoading(false) }), [classroom.id, classroom.ownerId, retry])

  async function save(ids: string[]) {
    setBusy(true)
    try { await setAttachedQuizzes(classroom.id, module.id, ids, classroom.ownerId); showToast('success', 'Attached quizzes updated.') }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Quizzes could not be attached.') }
    finally { setBusy(false) }
  }
  function toggle(quizId: string, checked: boolean) {
    const next = checked ? [...module.quizIds, quizId] : module.quizIds.filter((id) => id !== quizId)
    if (next.length > 10) { showToast('error', 'A module can have up to 10 attached quizzes.'); return }
    void save(next)
  }
  function move(index: number, offset: -1 | 1) {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= module.quizIds.length) return
    const next = [...module.quizIds]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    void save(next)
  }

  return <SectionCard title="Attached quizzes" description="Choose practice quizzes from this class. Students can open them when they are published." icon={<BookOpenText size={20} />}>
    {error && <p className="module-inline-error" role="alert">{error} <button type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>Retry</button></p>}
    {loading ? <div className="grid gap-2">{[0, 1].map((index) => <Skeleton key={index} className="h-14 rounded-xl" label="Loading class quizzes" />)}</div>
      : quizzes.length ? <div className="attached-quiz-layout">
        <fieldset className="attached-quiz-picker" disabled={busy}>
          <legend>Quizzes in this class</legend>
          {quizzes.map((quiz) => <label className="attached-quiz-option" key={quiz.id}>
            <input type="checkbox" checked={selected.has(quiz.id)} onChange={(event) => toggle(quiz.id, event.target.checked)} />
            <span><strong>{quiz.title || 'Untitled quiz'}</strong><small>{quiz.mode === 'quiz' ? 'Quiz' : 'Flashcards'} · <Badge>{quiz.status}</Badge></small>{quiz.status === 'draft' && <small>Students will see this once the quiz is published.</small>}</span>
          </label>)}
        </fieldset>
        <div className="attached-quiz-selected" aria-label="Attached quiz order">
          <h3>Attached ({module.quizIds.length}/10)</h3>
          {!module.quizIds.length ? <p>Select quizzes to attach them to this module.</p> : ordered.map((quiz, index) => <AttachedQuizRow key={module.quizIds[index]} quiz={quiz} index={index} total={ordered.length} busy={busy} onMove={move} onRemove={() => toggle(module.quizIds[index], false)} />)}
        </div>
      </div> : <EmptyState title="No quizzes in this class yet" description="Create a class quiz, then return here to attach it to this module." action={<Button to={'/instructor/quizzes/new?classId=' + encodeURIComponent(classroom.id)}><Plus size={16} aria-hidden="true" /> Create a quiz</Button>} />}
  </SectionCard>
}

function AttachedQuizRow({ quiz, index, total, busy, onMove, onRemove }: { quiz: QuizRecord | null; index: number; total: number; busy: boolean; onMove: (index: number, offset: -1 | 1) => void; onRemove: () => void }) {
  return <div className="attached-quiz-row"><div><strong>{quiz?.title ?? 'Unavailable quiz'}</strong><small>{quiz ? (quiz.mode === 'quiz' ? 'Quiz' : 'Flashcards') : 'This quiz was removed or is no longer available.'} {quiz && <Badge>{quiz.status}</Badge>}</small></div><div className="attached-quiz-row__actions"><Button type="button" variant="ghost" aria-label={'Move ' + (quiz?.title ?? 'quiz') + ' up'} disabled={busy || index === 0} onClick={() => onMove(index, -1)}><MoveUp size={16} aria-hidden="true" /></Button><Button type="button" variant="ghost" aria-label={'Move ' + (quiz?.title ?? 'quiz') + ' down'} disabled={busy || index === total - 1} onClick={() => onMove(index, 1)}><MoveDown size={16} aria-hidden="true" /></Button><Button type="button" variant="ghost" aria-label={'Remove ' + (quiz?.title ?? 'unavailable quiz')} disabled={busy} onClick={onRemove}><X size={16} aria-hidden="true" /></Button></div></div>
}
