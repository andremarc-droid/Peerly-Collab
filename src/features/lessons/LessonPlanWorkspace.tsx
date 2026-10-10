import { useCallback, useEffect, useState } from 'react'
import { Bot, Pencil, Play, Trash2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { useAuth } from '../auth/useAuth'
import { buildLessonFocus } from '../chatbot/studyFocus'
import { useTutorFocus } from '../chatbot/tutorFocusContext'
import { LessonPlayer } from './LessonPlayer'
import { advanceLessonProgress, finishLessonQuiz, nextLessonToResume } from './progress'
import { deleteLesson, getLessonPlan, loadLessonProgress, loadPlanSource, renameLessonPlan, reorderLessons, saveLesson, saveLessonProgress } from './services'
import { regenerateLesson } from './generate'
import type { Lesson, LessonPlan, LessonPlanOutline, LessonProgressRecord, LessonStep } from './types'
import { recordActivity } from '../stats/services'
import { XP_AWARDS } from '../stats/xp'

interface Props { plan: LessonPlan; onClose: () => void; onChanged: () => void }
export function LessonPlanWorkspace({ plan: initialPlan, onClose, onChanged }: Props) {
  const { user } = useAuth()
  const tutorFocus = useTutorFocus()
  const uid = user?.uid ?? ''
  const [plan, setPlan] = useState(initialPlan)
  const [lessons, setLessons] = useState<Record<string, Lesson>>({})
  const [progress, setProgress] = useState<LessonProgressRecord | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<LessonStep>('read')
  const [draft, setDraft] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([getLessonPlan(uid, plan.id), loadLessonProgress(uid, plan.id)]).then(async ([result, savedProgress]) => {
      if (!active) return
      if (!result) { setError('This lesson plan no longer exists.'); return }
      setPlan(result.plan); setLessons(result.lessons); setProgress(savedProgress)
      for (const [lessonId, completion] of Object.entries(savedProgress.lessons)) {
        if (completion.step === 'done' && !completion.xpAwarded) void recordActivity(uid, { kind: 'lessonCompleted', amount: XP_AWARDS.lessonCompleted, key: `lesson:${plan.id}:${lessonId}` })
      }
      const resumeId = nextLessonToResume(result.plan.order, savedProgress) ?? result.plan.order[0] ?? null
      if (resumeId) {
        setSelectedId(resumeId); setActiveStep(savedProgress.lessons[resumeId]?.step ?? 'read')
        if (!savedProgress.lessons[resumeId]) {
          const initialized = advanceLessonProgress(savedProgress, resumeId, 'read', { toMillis: () => Date.now() })
          setProgress(initialized); await saveLessonProgress(uid, result.plan.id, initialized)
        }
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this lesson plan.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [plan.id, uid])

  const selectLesson = (id: string) => {
    setSelectedId(id); setDraft(lessons[id] ?? null); setActiveStep(progress?.lessons[id]?.step ?? 'read')
    if (progress && !progress.lessons[id]) void persistProgress(advanceLessonProgress(progress, id, 'read', { toMillis: () => Date.now() }))
  }
  const persistProgress = useCallback(async (next: LessonProgressRecord): Promise<boolean> => {
    setProgress(next)
    try { await saveLessonProgress(uid, plan.id, next); return true } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save lesson progress.'); return false }
  }, [plan.id, uid])
  const changeStep = async (step: Exclude<LessonStep, 'done'>) => {
    if (!progress || !selectedId) return
    setActiveStep(step)
    await persistProgress(advanceLessonProgress(progress, selectedId, step, { toMillis: () => Date.now() }))
  }
  const finishQuiz = async (score: number, total: number) => {
    if (!progress || !selectedId) return
    setActiveStep('done')
    const saved = await persistProgress(finishLessonQuiz(progress, selectedId, score, total, { toMillis: () => Date.now() }))
    if (!saved) return
    const key = `lesson:${plan.id}:${selectedId}`
    void recordActivity(uid, { kind: 'lessonCompleted', amount: XP_AWARDS.lessonCompleted, key }).then(awarded => {
      if (awarded) setProgress(current => current ? { ...current, lessons: { ...current.lessons, [selectedId]: { ...current.lessons[selectedId]!, xpAwarded: true } } } : current)
    })
  }
  const nextLesson = () => {
    const index = plan.order.indexOf(selectedId ?? '')
    const next = plan.order[index + 1]
    if (next) selectLesson(next)
  }
  const moveLesson = async (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= plan.order.length) return
    const order = [...plan.order]; [order[index], order[target]] = [order[target]!, order[index]!]
    setBusy(true); setError('')
    try { await reorderLessons(uid, plan.id, order); setPlan(value => ({ ...value, order })); onChanged() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reorder lessons.') }
    finally { setBusy(false) }
  }
  const saveDraft = async () => {
    if (!draft || !selectedId) return
    setBusy(true); setError('')
    try { const { id: _id, updatedAt: _updated, ...value } = draft; await saveLesson(uid, plan.id, selectedId, value); const updated = { ...draft, updatedAt: { toMillis: () => Date.now() } }; setLessons(current => ({ ...current, [selectedId]: updated })); setDraft(updated); onChanged() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save lesson edits.') }
    finally { setBusy(false) }
  }
  const regenerate = async () => {
    if (!draft || !selectedId) return
    setBusy(true); setError('')
    try {
      const outline: LessonPlanOutline = { title: plan.title, lessons: plan.order.map(id => ({ id, title: lessons[id]?.title ?? id, objective: lessons[id]?.objective ?? '' })) }
      const savedSource = await loadPlanSource(uid, plan.id).catch(() => '')
      const generated = await regenerateLesson({ outline, lessonId: selectedId, level: plan.level, sourceText: savedSource || plan.topic })
      const updated = { ...generated, id: selectedId, updatedAt: { toMillis: () => Date.now() } }
      const { id: _id, updatedAt: _updated, ...safe } = updated
      await saveLesson(uid, plan.id, selectedId, safe)
      setLessons(current => ({ ...current, [selectedId]: updated })); setDraft(updated); onChanged()
    } catch (cause) { setError(cause instanceof Error ? `Regeneration failed. Your saved lesson is unchanged. ${cause.message}` : 'Regeneration failed. Your saved lesson is unchanged.') }
    finally { setBusy(false) }
  }
  const removeLesson = async () => {
    if (!selectedId) return
    setBusy(true); setError('')
    try {
      await deleteLesson(uid, plan.id, selectedId)
      const order = plan.order.filter(id => id !== selectedId)
      if (!order.length) { onChanged(); onClose(); return }
      setPlan(value => ({ ...value, order, lessonCount: order.length })); setLessons(current => { const next = { ...current }; delete next[selectedId]; return next }); setSelectedId(order[0]!); setDraft(lessons[order[0]!] ?? null); onChanged()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete lesson.') }
    finally { setBusy(false); setConfirmDelete(false) }
  }
  const activeLesson = selectedId ? lessons[selectedId] : undefined
  const selectedIndex = plan.order.indexOf(selectedId ?? '')
  const completion = selectedId ? progress?.lessons[selectedId] : undefined

  return <>
    <Dialog open onClose={busy ? () => undefined : onClose} title={plan.title} description={`${plan.topic} · ${plan.level}`} className="lesson-workspace-dialog">
      <div className="grid min-w-0 gap-4">
        {error && <Alert tone="error" label="Lesson plan">{error}</Alert>}
        {loading ? <p role="status" className="m-0 text-base text-navy-900">Loading your lessons…</p> : <>
          <Input label="Plan title" value={plan.title} maxLength={120} onChange={event => setPlan(value => ({ ...value, title: event.target.value }))}/><Button variant="secondary" disabled={busy || plan.title.trim() === initialPlan.title} onClick={() => { setBusy(true); void renameLessonPlan(uid, plan.id, plan.title).then(onChanged).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not rename plan.')).finally(() => setBusy(false)) }}>Save plan title</Button>
          <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.5fr)]">
            <div className="grid content-start gap-2"><h3 className="m-0 text-lg font-bold text-navy-900">Lessons</h3>{plan.order.map((id, index) => <article key={id} className="grid gap-1 rounded-2xl border border-navy-900-15 bg-white p-3"><Button variant={selectedId === id ? 'primary' : 'secondary'} onClick={() => selectLesson(id)}>{lessons[id]?.title ?? `Lesson ${index + 1} · Not generated`}</Button><div className="flex gap-2"><Button variant="secondary" aria-label={`Move lesson ${index + 1} up`} disabled={busy || index === 0} onClick={() => void moveLesson(index, -1)}>↑</Button><Button variant="secondary" aria-label={`Move lesson ${index + 1} down`} disabled={busy || index === plan.order.length - 1} onClick={() => void moveLesson(index, 1)}>↓</Button></div></article>)}</div>
            <div className="min-w-0">{activeLesson && selectedId ? <div className="grid min-w-0 gap-4"><div className="flex flex-wrap gap-2"><Button variant={activeStep === 'read' && draft ? 'primary' : 'secondary'} onClick={() => { setDraft(activeLesson); setActiveStep('read') }}><Pencil size={16}/>Edit</Button><Button variant={activeStep !== 'read' || !draft ? 'primary' : 'secondary'} onClick={() => { setDraft(null); setActiveStep(progress?.lessons[selectedId]?.step ?? 'read') }}><Play size={16}/>Resume</Button>{tutorFocus && <Button variant="secondary" onClick={() => { const focus = buildLessonFocus({ title: activeLesson.title, objective: activeLesson.objective, content: activeLesson.content, keyPoints: activeLesson.keyPoints }); if (focus) { tutorFocus.askTutor(focus); onClose() } }}><Bot size={16}/>Ask tutor</Button>}</div>{draft && activeStep === 'read' ? <div className="grid gap-3"><Input label="Lesson title" value={draft.title} maxLength={120} onChange={event => setDraft(value => value ? { ...value, title: event.target.value } : value)}/><p className="m-0 text-sm text-navy-900">{draft.objective}</p><Textarea label="Lesson content (Markdown)" value={draft.content} maxLength={2000} rows={9} onChange={event => setDraft(value => value ? { ...value, content: event.target.value } : value)}/><h4 className="m-0 text-base font-bold text-navy-900">Flashcards</h4>{draft.flashcards.map((card, index) => <div className="grid gap-2 rounded-xl border border-navy-900-15 p-3" key={card.id}><Textarea label={`Card ${index + 1} front`} value={card.front} maxLength={300} rows={2} onChange={event => setDraft(value => value ? { ...value, flashcards: value.flashcards.map(item => item.id === card.id ? { ...item, front: event.target.value } : item) } : value)}/><Textarea label={`Card ${index + 1} back`} value={card.back} maxLength={600} rows={2} onChange={event => setDraft(value => value ? { ...value, flashcards: value.flashcards.map(item => item.id === card.id ? { ...item, back: event.target.value } : item) } : value)}/></div>)}<div className="flex flex-wrap gap-2"><Button variant="primary" disabled={busy} onClick={() => void saveDraft()}>{busy ? 'Saving…' : 'Save lesson edits'}</Button><Button variant="secondary" disabled={busy} onClick={() => void regenerate()}>Regenerate lesson</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Delete lesson</Button></div></div> : <LessonPlayer uid={uid} plan={plan} lesson={activeLesson} completion={completion} step={activeStep} onStep={step => void changeStep(step)} onQuizComplete={(score, total) => void finishQuiz(score, total)} onNext={nextLesson} hasNext={selectedIndex >= 0 && selectedIndex < plan.order.length - 1}/>}</div> : <p className="m-0 text-base text-navy-900">This lesson has not been generated yet.</p>}</div>
          </section>
        </>}
        <footer className="flex justify-end border-t border-navy-900-15 pt-3"><Button variant="secondary" onClick={onClose}>Close</Button></footer>
      </div>
    </Dialog>
    <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => void removeLesson()} title="Delete this lesson?" description="Its lesson content and spaced-repetition progress will be removed." confirmLabel="Delete lesson" busy={busy}/>
  </>
}
