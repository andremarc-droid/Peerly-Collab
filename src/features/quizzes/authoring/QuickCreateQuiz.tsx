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

function parseMode(value: string | null): QuizMode | null {
  if (value === 'quiz' || value === 'flashcards' || value === 'canvas') return value
  return null
}

export function QuickCreateQuiz() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const { showToast } = useToast()
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [title, setTitle] = useState('')
  const rawMode = parseMode(params.get('mode'))
  const lockedClass = params.get('classId')
  const isCanvasFromClass = Boolean(lockedClass && rawMode === 'canvas')
  const [mode, setMode] = useState<QuizMode>(rawMode ?? 'quiz')
  const [boardKind, setBoardKind] = useState<'prebuilt' | 'blank'>('prebuilt')
  const [classId, setClassId] = useState(lockedClass ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => user ? watchMyClasses(user.uid, setClasses, (error) => showToast('error', error.message)) : undefined, [user, showToast])
  const activeClasses = classes.filter((item) => item.status === 'active')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!user || !title.trim() || !classId) return
    setBusy(true)
    try {
      const id = await createQuiz(user.uid, profile?.name || user.displayName || 'Instructor', {
        classId,
        title: title.trim(),
        description: '',
        tags: [],
        mode,
        boardKind: mode === 'canvas' ? boardKind : undefined,
        settings: defaultQuizSettings(mode),
      })
      showToast('success', 'Draft created.')
      navigate(`/instructor/quizzes/${id}?tab=questions${mode === 'canvas' ? '' : '&newQuestion=1'}`, {
        replace: true,
        state: {
          from: lockedClass
            ? `/instructor/classes/${lockedClass}${isCanvasFromClass ? '?tab=canvas' : ''}`
            : location.pathname.startsWith('/instructor/classes/')
            ? location.pathname
            : '/instructor/quizzes',
        },
      })
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Quiz could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = busy
    ? 'Creating…'
    : mode === 'canvas'
    ? 'Create canvas'
    : mode === 'flashcards'
    ? 'Create flashcards'
    : 'Create quiz'

  const dialogTitle = mode === 'canvas' ? 'Create canvas' : mode === 'flashcards' ? 'Create flashcards' : 'Create quiz'

  return (
    <AppShell>
      <Dialog
        open
        onClose={() => navigate(lockedClass ? `/instructor/classes/${lockedClass}${isCanvasFromClass ? '?tab=canvas' : ''}` : '/instructor/quizzes')}
        title={dialogTitle}
        description="Start with the essentials. You can change the details anytime."
      >
        {activeClasses.length === 0 ? (
          <div className="grid gap-4">
            <p>You’ll need a class before you can create a quiz.</p>
            <Button to="/instructor">Create a class</Button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
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
                      disabled={isCanvasFromClass && !isSelected}
                      onClick={() => {
                        if (!isCanvasFromClass) setMode(item.value)
                      }}
                      className={`flex flex-col text-left p-3 rounded-2xl border transition-colors ${
                        isSelected
                          ? 'border-navy-900 bg-navy-900 text-white shadow-sm'
                          : isCanvasFromClass
                          ? 'border-navy-900-12 bg-white text-navy-900 opacity-50 cursor-not-allowed'
                          : 'border-navy-900-12 bg-white text-navy-900 hover:border-navy-900-24'
                      }`}
                    >
                      <span className="font-semibold text-sm">{item.label}</span>
                      <span className={`text-sm mt-1 leading-snug ${isSelected ? 'text-white/80' : 'text-navy-800-72'}`}>
                        {item.description}
                      </span>
                    </button>
                  )
                })}
              </div>
              {isCanvasFromClass && (
                <p className="m-0 text-sm text-navy-800-72" role="note">
                  Locked to Canvas for activities created from the Canvas tab.
                </p>
              )}
            </fieldset>
            {mode === 'canvas' && (
              <fieldset className="grid gap-2">
                <legend className="field__label">Canvas type</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={boardKind === 'prebuilt'}
                    onClick={() => setBoardKind('prebuilt')}
                    className={`flex flex-col text-left p-3 rounded-2xl border transition-colors ${
                      boardKind === 'prebuilt'
                        ? 'border-navy-900 bg-navy-900 text-white shadow-sm'
                        : 'border-navy-900-12 bg-white text-navy-900 hover:border-navy-900-24'
                    }`}
                  >
                    <span className="font-semibold text-sm">Pre-built board</span>
                    <span className={`text-sm mt-1 leading-snug ${boardKind === 'prebuilt' ? 'text-white/80' : 'text-navy-800-72'}`}>
                      You set the cards and the answer, graded automatically.
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={boardKind === 'blank'}
                    onClick={() => setBoardKind('blank')}
                    className={`flex flex-col text-left p-3 rounded-2xl border transition-colors ${
                      boardKind === 'blank'
                        ? 'border-navy-900 bg-navy-900 text-white shadow-sm'
                        : 'border-navy-900-12 bg-white text-navy-900 hover:border-navy-900-24'
                    }`}
                  >
                    <span className="font-semibold text-sm">Blank board</span>
                    <span className={`text-sm mt-1 leading-snug ${boardKind === 'blank' ? 'text-white/80' : 'text-navy-800-72'}`}>
                      Students build their own, you check it.
                    </span>
                  </button>
                </div>
              </fieldset>
            )}
            <Select
              label="Class"
              name="quiz-class"
              value={classId}
              disabled={Boolean(lockedClass)}
              onChange={(event) => setClassId(event.target.value)}
              options={[{ label: 'Choose a class', value: '' }, ...activeClasses.map((item) => ({ label: item.name, value: item.id }))]}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigate(
                    lockedClass ? `/instructor/classes/${lockedClass}${isCanvasFromClass ? '?tab=canvas' : ''}` : '/instructor/quizzes',
                  )
                }
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim() || !classId || busy}>
                {submitLabel}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </AppShell>
  )
}
