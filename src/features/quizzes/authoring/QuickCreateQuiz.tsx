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

import type { QuizMode } from '../types'

const TYPE_OPTIONS: Array<{ value: QuizMode; label: string; description: string }> = [
  {
    value: 'quiz',
    label: 'Quiz',
    description: 'Questions with multiple choice, identification, or typed answers.',
  },
  {
    value: 'flashcards',
    label: 'Flashcards',
    description: 'Self-rated front and back study cards for spaced recall.',
  },
  {
    value: 'canvas',
    label: 'Canvas',
    description: 'Visual board where students connect related concept cards.',
  },
]

export function QuickCreateQuiz() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const { showToast } = useToast()
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<QuizMode>('quiz')
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
      navigate(`/instructor/quizzes/${id}?tab=questions${mode === 'canvas' ? '' : '&newQuestion=1'}`, { replace: true, state: { from: location.pathname.startsWith('/instructor/classes/') ? location.pathname : '/instructor/quizzes' } })
    } catch (error) { showToast('error', error instanceof Error ? error.message : 'Quiz could not be created.') }
    finally { setBusy(false) }
  }
  return <AppShell><Dialog open onClose={() => navigate(lockedClass ? `/instructor/classes/${lockedClass}` : '/instructor/quizzes')} title="Create quiz" description="Start with the essentials. You can change the details anytime.">
    {activeClasses.length === 0 ? <div className="grid gap-4"><p>You’ll need a class before you can create a quiz.</p><Button to="/instructor">Create a class</Button></div> : <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Input label="Title" name="quiz-title" required value={title} onChange={(event) => setTitle(event.target.value)} />
      <fieldset className="grid gap-2">
        <legend className="field__label">Type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((item) => {
            const isSelected = mode === item.value
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setMode(item.value)}
                className={`flex flex-col text-left p-3 rounded-2xl border transition-colors ${
                  isSelected
                    ? 'border-navy-900 bg-navy-900 text-white shadow-sm'
                    : 'border-navy-900-12 bg-white text-navy-900 hover:border-navy-900-24'
                }`}
              >
                <span className="font-semibold text-sm">{item.label}</span>
                <span className={`text-xs mt-1 leading-snug ${isSelected ? 'text-white/80' : 'text-navy-800-72'}`}>
                  {item.description}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <Select label="Class" name="quiz-class" value={classId} disabled={Boolean(lockedClass)} onChange={(event) => setClassId(event.target.value)} options={[{ label: 'Choose a class', value: '' }, ...activeClasses.map((item) => ({ label: item.name, value: item.id }))]} />
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => navigate(lockedClass ? `/instructor/classes/${lockedClass}` : '/instructor/quizzes')}>Cancel</Button><Button type="submit" disabled={!title.trim() || !classId || busy}>{busy ? 'Creating…' : 'Create and continue'}</Button></div>
    </form>}
  </Dialog></AppShell>
}
