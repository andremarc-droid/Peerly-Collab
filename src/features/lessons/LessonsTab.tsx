import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ellipsis, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { DataCard } from '../../shared/ui/DataCard'
import { Dialog } from '../../shared/ui/Dialog'
import { DropdownMenu } from '../../shared/ui/DropdownMenu'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Input } from '../../shared/ui/Input'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useAuth } from '../auth/useAuth'
import { generateRemainingLessons } from './generate'
import { lessonPlanCompletion } from './progress'
import { deletePlan, getLessonPlan, listLessonPlans, loadPlanSource, renameLessonPlan, saveLesson, loadLessonProgress } from './services'
import { LearnTopicDialog } from './LearnTopicDialog'
import { LessonPlanWorkspace } from './LessonPlanWorkspace'
import type { LessonPlan, LessonPlanOutline, LessonProgressRecord, LessonRecord } from './types'

export function LessonsTab() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const uid = user?.uid ?? ''
  const [plans, setPlans] = useState<LessonPlan[]>([])
  const [progress, setProgress] = useState<Record<string, LessonProgressRecord>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<LessonPlan | null>(null)
  const [renameTarget, setRenameTarget] = useState<LessonPlan | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LessonPlan | null>(null)
  const [busyId, setBusyId] = useState('')
  const [progressText, setProgressText] = useState('')
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!uid) return
    setLoading(true); setError('')
    try {
      const next = await listLessonPlans(uid)
      setPlans(next)
      const states = await Promise.all(next.map(async plan => [plan.id, await loadLessonProgress(uid, plan.id)] as const))
      setProgress(Object.fromEntries(states))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load lesson plans.') }
    finally { setLoading(false) }
  }, [uid])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const requested = params.get('plan')
    if (loading || !requested) return
    const found = plans.find(plan => plan.id === requested)
    if (found) setEditing(found)
    const next = new URLSearchParams(params); next.delete('plan'); setParams(next, { replace: true })
  }, [loading, params, plans, setParams])

  const startRename = (plan: LessonPlan) => { setRenameTarget(plan); setRenameValue(plan.title) }
  const saveRename = async () => {
    if (!renameTarget) return
    setBusyId(renameTarget.id); setError('')
    try { await renameLessonPlan(uid, renameTarget.id, renameValue); setRenameTarget(null); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not rename plan.') }
    finally { setBusyId('') }
  }
  const removePlan = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id); setError('')
    try { await deletePlan(uid, deleteTarget.id); setDeleteTarget(null); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete plan.') }
    finally { setBusyId('') }
  }
  const generatePlanLessons = async (plan: LessonPlan) => {
    setBusyId(plan.id); setError(''); setProgressText('Starting…'); controller.current = new AbortController()
    try {
      const result = await getLessonPlan(uid, plan.id)
      if (!result) throw new Error('This plan no longer exists.')
      const current = result.lessons
      const outline: LessonPlanOutline = { title: plan.title, lessons: plan.order.map(id => ({ id, title: current[id]?.title ?? `Lesson ${plan.order.indexOf(id) + 1}`, objective: current[id]?.objective ?? plan.topic })) }
      const ids = plan.status === 'partial' ? plan.order.filter(id => !current[id]) : plan.order
      const existing = plan.status === 'partial' ? Object.fromEntries(Object.entries(current).map(([id, item]) => { const { id: _id, updatedAt: _updated, ...value } = item; return [id, value] })) as Record<string, Omit<LessonRecord, 'updatedAt'>> : {}
      const savedSource = await loadPlanSource(uid, plan.id).catch(() => '')
      const generated = await generateRemainingLessons({ topic: plan.topic, level: plan.level, lessonCount: plan.lessonCount, outline, sourceText: savedSource || plan.topic, signal: controller.current.signal, existing, lessonIds: ids, onProgress: (done, total) => setProgressText(`Lesson ${done} of ${total}`) })
      const before = new Set(Object.keys(current))
      for (const [id, item] of Object.entries(generated.lessons)) {
        if (before.has(id)) continue
        await saveLesson(uid, plan.id, id, item)
      }
      if (generated.failureReason === 'rate-limit') setError('The AI is rate-limited. Completed lessons were saved; try again later.')
      else if (generated.failureReason) setError('Some lessons could not be regenerated. Their previous saved versions remain available.')
      else if (generated.cancelled) setError('Regeneration was cancelled. Completed lessons were saved.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not regenerate lessons.') }
    finally { setBusyId(''); setProgressText(''); controller.current = null }
  }

  const menu = (plan: LessonPlan) => <DropdownMenu label={`More actions for ${plan.title}`} iconOnly className="lg:hidden" trigger={<Ellipsis size={20} aria-hidden="true"/>}>
    <button type="button" role="menuitem" onClick={() => startRename(plan)}><Pencil size={16} aria-hidden="true"/>Rename</button>
    <button type="button" role="menuitem" disabled={busyId === plan.id} onClick={() => void generatePlanLessons(plan)}><RefreshCw size={16} aria-hidden="true"/>Regenerate lessons</button>
    <button type="button" role="menuitem" className="is-danger" onClick={() => setDeleteTarget(plan)}><Trash2 size={16} aria-hidden="true"/>Delete</button>
  </DropdownMenu>

  return <section className="grid gap-4" aria-labelledby="lessons-heading">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="lessons-heading" className="m-0 text-xl font-bold text-navy-900">Your lesson plans</h2><p className="m-0 text-base text-navy-900">Build a guided path from a topic or your own study material.</p></div><Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={16} aria-hidden="true"/>Learn a topic</Button></header>
    {error && <Alert tone="error" label="Lessons">{error}</Alert>}
    {loading ? <div className="grid gap-3">{[1, 2, 3].map(item => <Skeleton key={item} className="h-28 rounded-2xl"/>)}</div> : plans.length === 0 ? <EmptyState title="No lesson plans yet" description="Choose a topic and create a private, step-by-step learning plan." action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Learn a topic</Button>}/> : <div className="grid gap-3">{plans.map(plan => {
      const percent = lessonPlanCompletion(plan.order, progress[plan.id] ?? { version: 1, lessons: {}, lastLessonId: null, updatedAt: plan.updatedAt })
      return <DataCard key={plan.id} title={plan.title} meta={`${plan.topic} · ${plan.level} · ${plan.lessonCount} lessons`} badge={plan.status === 'partial' ? <span className="badge">Partial</span> : <span className="badge">{percent}% complete</span>} actions={<div className="flex flex-wrap items-center gap-2"><Button variant="primary" disabled={busyId === plan.id} onClick={() => setEditing(plan)}>Resume</Button><Button variant="secondary" className="hidden lg:inline-flex" disabled={busyId === plan.id} onClick={() => startRename(plan)}>Rename</Button><Button variant="secondary" className="hidden lg:inline-flex" disabled={busyId === plan.id} onClick={() => void generatePlanLessons(plan)}>{busyId === plan.id ? progressText || 'Generating…' : plan.status === 'partial' ? 'Generate the rest' : 'Regenerate lessons'}</Button><Button variant="secondary" className="hidden lg:inline-flex" disabled={busyId === plan.id} onClick={() => setDeleteTarget(plan)}>Delete</Button>{menu(plan)}</div>}>
        <div className="grid gap-2"><div className="flex justify-between gap-2 text-sm text-navy-900"><span>Completion</span><span>{percent}%</span></div><progress className="h-3 w-full accent-navy-900" max={100} value={percent} aria-label={`${plan.title} completion`}/>{plan.status === 'partial' && <p className="m-0 text-sm text-navy-900">Some lessons still need to be generated.</p>}</div>
      </DataCard>
    })}</div>}
    {createOpen && <LearnTopicDialog uid={uid} onClose={() => setCreateOpen(false)} onSaved={() => { void refresh() }} onOpen={plan => setEditing(plan)}/>}
    {editing && <LessonPlanWorkspace key={editing.id} plan={editing} onClose={() => setEditing(null)} onChanged={() => void refresh()}/>}
    {renameTarget && <Dialog open onClose={() => setRenameTarget(null)} title="Rename lesson plan" description="Choose a short title for this plan."><div className="grid gap-3"><Input label="Plan title" value={renameValue} maxLength={120} onChange={event => setRenameValue(event.target.value)}/><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRenameTarget(null)}>Cancel</Button><Button variant="primary" disabled={busyId === renameTarget.id || !renameValue.trim()} onClick={() => void saveRename()}>Save title</Button></div></div></Dialog>}
    <ConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={() => void removePlan()} title="Delete this lesson plan?" description="All lessons, completion history, and lesson flashcard progress in this plan will be deleted." confirmLabel="Delete plan" busy={Boolean(deleteTarget && busyId === deleteTarget.id)}/>
  </section>
}
