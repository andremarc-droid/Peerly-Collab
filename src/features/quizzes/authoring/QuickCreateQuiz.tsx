import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useUserProfile } from '../../profile/useUserProfile'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { Input } from '../../../shared/ui/Input'
import { Select } from '../../../shared/ui/Select'
import { useToast } from '../../../shared/ui/useToast'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import { createQuiz } from '../services'
import { defaultQuizSettings } from '../schemas/settings'
import { AppShell } from '../../../app/AppShell'

export function QuickCreateQuiz() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const { showToast } = useToast()
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'quiz' | 'flashcards'>('quiz')
  const [classId, setClassId] = useState(params.get('classId') ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => user ? watchMyClasses(user.uid, setClasses, (error) => showToast('error', error.message)) : undefined, [user, showToast])
  const activeClasses = classes.filter((item) => item.status === 'active')
  const lockedClass = params.get('classId')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || !title.trim() || !classId) return
    setBusy(true)
    try {
      const id = await createQuiz(user.uid, profile?.name || user.displayName || 'Instructor', { classId, title: title.trim(), description: '', tags: [], mode, settings: defaultQuizSettings(mode) })
      showToast('success', 'Draft created.')
      navigate(`/instructor/quizzes/${id}?tab=questions&newQuestion=1`, { replace: true, state: { from: location.pathname.startsWith('/instructor/classes/') ? location.pathname : '/instructor/quizzes' } })
    } catch (error) { showToast('error', error instanceof Error ? error.message : 'Quiz could not be created.') }
    finally { setBusy(false) }
  }
  return <AppShell><Dialog open onClose={() => navigate(lockedClass ? `/instructor/classes/${lockedClass}` : '/instructor/quizzes')} title="Create quiz" description="Start with the essentials. You can change the details anytime.">
    {activeClasses.length === 0 ? <div className="grid gap-4"><p>You’ll need a class before you can create a quiz.</p><Button to="/instructor">Create a class</Button></div> : <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Input label="Title" name="quiz-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
      <fieldset className="grid gap-2"><legend className="field__label">Type</legend><div className="flex flex-wrap gap-2">{(['quiz', 'flashcards'] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)} className="min-h-11 rounded-full border border-navy-300 px-4 font-semibold aria-pressed:bg-navy-800 aria-pressed:text-white">{item === 'quiz' ? 'Quiz' : 'Flashcards'}</button>)}</div></fieldset>
      <Select label="Class" name="quiz-class" value={classId} disabled={Boolean(lockedClass)} onChange={(event) => setClassId(event.target.value)} options={[{ label: 'Choose a class', value: '' }, ...activeClasses.map((item) => ({ label: item.name, value: item.id }))]} />
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => navigate(lockedClass ? `/instructor/classes/${lockedClass}` : '/instructor/quizzes')}>Cancel</Button><Button type="submit" disabled={!title.trim() || !classId || busy}>{busy ? 'Creating…' : 'Create and continue'}</Button></div>
    </form>}
  </Dialog></AppShell>
}
