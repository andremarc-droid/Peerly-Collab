import { ArrowLeft, ArrowRight, Plus, Save } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { useUserProfile } from '../../profile/useUserProfile'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { RadioGroup } from '../../../shared/ui/RadioGroup'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Select } from '../../../shared/ui/Select'
import { useToast } from '../../../shared/ui/useToast'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'
import { defaultQuizSettings, currentMinute } from '../schemas/settings'
import { DueDateTimeField } from '../../assignments/DueDateTimeField'
import { effectiveTimeLimitSeconds, fromDateTimeLocal, splitSeconds, timeLimitFields, timingProblem, toDateTimeLocal } from '../quizTiming'
import { createQuiz, getQuiz, unpublishQuiz, updateQuiz, watchQuiz, type QuizRecord } from '../services'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import type { QuizSettings, QuizStatus } from '../types'
import { validateQuizForm, type QuizFormErrors, type QuizFormValues } from './validation'
import { GroupSettingsSection } from './GroupSettingsSection'
import { describeQuizExperience, hasTeamParticipation } from './quizExperience'
import { QuizPublishTab } from './QuizPublishTab'
import { QuizWorkflowNav, quizStepPath } from './QuizWorkflowNav'
import { QuickCreateQuiz } from '../authoring/QuickCreateQuiz'
const QuestionBuilderPage = lazy(() => import('../builder/QuestionBuilderPage').then((module) => ({ default: module.QuestionBuilderPage })))

const revealOptions = [
  { value: 'after_each', label: 'After each question', hint: 'See the answer and explanation right after responding.' },
  { value: 'after_submit', label: 'After the quiz is submitted', hint: 'Work through the whole quiz before reviewing answers.' },
  { value: 'never', label: 'Never', hint: 'Keep answers hidden during practice.' },
]
const scoreOptions = [
  { value: 'immediate', label: 'Students see their score immediately', hint: 'Scores are visible as soon as their attempt is graded.' },
  { value: 'after_release', label: 'I’ll release scores later', hint: 'Turn on score release from the results page later.' },
  { value: 'hidden', label: 'Students never see scores', hint: 'Only you can see results for this quiz.' },
]

/**
 * Making a quiz is one path: Create, then Questions, then Settings, then Preview & publish.
 * This page owns the routing between those steps and the Settings step itself.
 */
export function QuizEditorPage() {
  const { quizId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const ownerId = user?.uid
  const { profile } = useUserProfile()
  const { showToast } = useToast()
  const [form, setForm] = useState<QuizFormValues>(() => ({ classId: searchParams.get('classId') ?? '', title: '', description: '', tags: '', mode: 'quiz', settings: defaultQuizSettings('quiz') }))
  const [saved, setSaved] = useState<QuizFormValues>(() => ({ classId: searchParams.get('classId') ?? '', title: '', description: '', tags: '', mode: 'quiz', settings: defaultQuizSettings('quiz') }))
  const [classes, setClasses] = useState<ClassWithId[]>([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [status, setStatus] = useState<QuizStatus>('draft')
  const [resolvedQuizId, setResolvedQuizId] = useState<string | null>(null)
  const loading = Boolean(quizId && resolvedQuizId !== quizId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<QuizFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isCustomAttempts, setIsCustomAttempts] = useState(false)
  const [customAttemptsText, setCustomAttemptsText] = useState('')
  const [minutesText, setMinutesText] = useState<string | null>(null)
  const [secondsText, setSecondsText] = useState<string | null>(null)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useUnsavedChangesGuard(dirty)

  useEffect(() => {
    if (!ownerId) return undefined
    return watchMyClasses(ownerId, (items) => { setClasses(items); setClassesLoaded(true) }, (reason) => { setLoadError(reason.message); setClassesLoaded(true) })
  }, [ownerId])

  useEffect(() => {
    if (!quizId) return
    let active = true
    let isInitial = true
    const subscribe = typeof watchQuiz === 'function'
      ? watchQuiz
      : (id: string, onChange: (q: QuizRecord | null) => void, onError: (e: Error) => void) => {
          getQuiz(id).then(onChange).catch((err) => onError(err instanceof Error ? err : new Error(String(err))))
          return () => {}
        }
    const stop = subscribe(
      quizId,
      (quiz) => {
        if (!active) return
        if (!quiz) {
          setLoadError('This quiz could not be found.')
          setResolvedQuizId(quizId)
          return
        }
        setQuestionCount(quiz.questionCount)
        setStatus(quiz.status)
        setResolvedQuizId(quizId)

        if (isInitial || !dirtyRef.current) {
          const values = {
            classId: quiz.classId ?? '',
            title: quiz.title,
            description: quiz.description,
            tags: quiz.tags.join(', '),
            mode: quiz.mode,
            settings: quiz.settings,
          }
          setForm(values)
          setSaved(values)
          if (quiz.settings.attemptsAllowed !== null && ![1, 2, 3].includes(quiz.settings.attemptsAllowed)) {
            setIsCustomAttempts(true)
            setCustomAttemptsText(String(quiz.settings.attemptsAllowed))
          }
        }

        if (isInitial && quiz.status === 'published') {
          void Promise.resolve(unpublishQuiz(quizId)).then(() => {
            if (active) {
              setStatus('draft')
              showToast('info', 'Quiz automatically unpublished for editing. Changes will reflect to students once re-published.')
            }
          }).catch(() => {})
        }
        isInitial = false
      },
      (reason) => {
        if (active) {
          setLoadError(reason.message)
          setResolvedQuizId(quizId)
        }
      },
    )
    return () => {
      active = false
      stop()
    }
  }, [quizId, showToast])

  function updateSettings(patch: Partial<QuizSettings>) {
    setForm((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }

  const backPath = form.classId ? `/instructor/classes/${form.classId}` : '/instructor/quizzes'
  function leaveEditor() {
    if (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) navigate(backPath)
  }

  // A draft moves straight on to Preview & publish after its settings are saved.
  const continueToPublish = status === 'draft'

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitIntent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const addQuestionsAfterSave = submitIntent === 'save-and-add-questions'
    const validation = validateQuizForm(form)
    const classAssignmentChanged = Boolean(form.classId && form.classId !== saved.classId)
    if (quizId && !classAssignmentChanged) delete validation.classId
    if (classAssignmentChanged && classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active')) validation.classId = 'Choose an active class before saving this quiz.'
    setErrors(validation)
    if (Object.keys(validation).length) return
    if (!user) return
    setSaving(true); setSaveError(null)
    const parsedCustom = parseInt(customAttemptsText, 10)
    const finalAttempts = isCustomAttempts
      ? (!Number.isNaN(parsedCustom) && parsedCustom >= 1 ? parsedCustom : 1)
      : form.settings.attemptsAllowed
    const finalSettings = {
      ...form.settings,
      attemptsAllowed: finalAttempts,
    }
    const input = { ...(!quizId || classAssignmentChanged ? { classId: form.classId } : {}), title: form.title.trim(), description: form.description.trim(), tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), settings: finalSettings }
    try {
      if (quizId) {
        await updateQuiz(quizId, input)
        const savedForm = { ...form, classId: form.classId || saved.classId }
        setForm(savedForm)
        setSaved(savedForm)
        showToast('success', 'Quiz settings saved.')
        if (continueToPublish) navigate(quizStepPath(quizId, 'publish'))
      } else {
        const created = await createQuiz(user.uid, profile?.name || user.displayName || 'Instructor', { ...input, mode: form.mode })
        setSaved(form); showToast('success', 'Draft quiz created.')
        navigate(`/instructor/quizzes/${created}${addQuestionsAfterSave ? '/questions' : ''}`, { replace: true })
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Your quiz could not be saved.'
      setSaveError(message); showToast('error', message)
    } finally { setSaving(false) }
  }

  if (loading) return <AppShell><PageHeader eyebrow="QUIZ SETTINGS" title="Loading quiz…" subtitle="" /><main className="app-shell__content quiz-editor"><div className="quiz-editor-skeleton" aria-label="Loading quiz settings" /></main></AppShell>
  if (!quizId) return <QuickCreateQuiz />
  if (loadError) return <AppShell><PageHeader eyebrow="QUIZ SETTINGS" title="Quiz unavailable" subtitle="We couldn’t load these settings." /><main className="app-shell__content quiz-editor"><Alert tone="error" label="Quiz not available">{loadError}</Alert><Button to="/instructor/quizzes">Back to all quizzes</Button></main></AppShell>

  const activeTab = searchParams.get('tab') ?? 'questions'
  if (activeTab === 'questions') {
    return (
      <Suspense fallback={<div className="quiz-editor-skeleton" aria-label="Loading question builder" />}>
        <QuestionBuilderPage />
      </Suspense>
    )
  }
  // "preview" is the old name of the final step; old links keep working.
  if (activeTab === 'publish' || activeTab === 'preview') return <QuizPublishTab quizId={quizId} />

  const participation = form.settings.participation
  const isGroupQuiz = form.mode === 'quiz' && participation.type === 'group'
  const limitSeconds = effectiveTimeLimitSeconds(form.settings)
  const limitParts = splitSeconds(limitSeconds ?? 0)
  const limitProblem = limitSeconds === null ? null : timingProblem({ timeLimitMinutes: form.settings.timeLimitMinutes, timeLimitSeconds: limitSeconds })
  const windowProblem = timingProblem({ timeLimitMinutes: null, opensAt: form.settings.opensAt, closesAt: form.settings.closesAt })
  const experience = describeQuizExperience({ mode: form.mode, title: form.title, settings: form.settings })
  const showCustomAttempts = isCustomAttempts || (form.settings.attemptsAllowed !== null && ![1, 2, 3].includes(form.settings.attemptsAllowed))
  const saveLabel = saving ? 'Saving…' : !classesLoaded ? 'Loading classes…' : continueToPublish ? 'Save and continue' : 'Save settings'

  return <AppShell>
    <PageHeader eyebrow={quizId ? 'EDIT QUIZ' : 'NEW QUIZ'} title={quizId ? 'Quiz settings.' : 'Create a quiz.'} subtitle={continueToPublish ? 'Choose how students take this quiz. Next you will preview and publish it.' : 'Choose how students take this quiz.'} action={<Button type="button" variant="secondary" onClick={leaveEditor}><ArrowLeft size={17} aria-hidden="true" /> Back</Button>} />
    <main className="app-shell__content quiz-editor" id="main-content">
      <QuizWorkflowNav quizId={quizId} current="settings" hasTeams={hasTeamParticipation(form.mode, form.settings)} />
      {saveError && <Alert tone="error" label="Could not save changes">{saveError}</Alert>}
      {quizId && (!form.classId || (classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active'))) && <Alert tone="warning" label="Assign this quiz to a class">Choose an active class below and save to keep this quiz in the classroom catalog.</Alert>}
      {classesLoaded && !classes.some((item) => item.status === 'active') && <Alert tone="warning" label="Create a class first">Quizzes must belong to an active class. <Button to="/instructor" variant="secondary">Create a class</Button></Alert>}
      <form className="quiz-editor__form" onSubmit={handleSave} noValidate>
        <SectionCard title="Basics" description="Give learners a clear idea of what they’ll practice.">
          <div className="quiz-editor__fields">
            <Select label="Class" name="quiz-class" value={classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active') ? '' : form.classId} onChange={(event) => { setForm({ ...form, classId: event.target.value }); setErrors({ ...errors, classId: undefined }) }} options={[{ label: classesLoaded ? 'Choose an active class' : 'Loading classes…', value: '' }, ...classes.filter((item) => item.status === 'active').map((item) => ({ label: item.name, value: item.id }))]} error={errors.classId} required hint="Quizzes are published to one class at a time." />
            <Input label="Quiz title" name="quiz-title" value={form.title} onChange={(event) => { setForm({ ...form, title: event.target.value }); setErrors({ ...errors, title: undefined }) }} error={errors.title} required maxLength={120} />
            <label className="field" htmlFor="quiz-description"><span className="field__label">Description</span><textarea id="quiz-description" className="field__control quiz-editor__textarea" value={form.description} onChange={(event) => { setForm({ ...form, description: event.target.value }); setErrors({ ...errors, description: undefined }) }} rows={3} maxLength={2000} /></label>
            <Input label="Tags" name="quiz-tags" value={form.tags} onChange={(event) => { setForm({ ...form, tags: event.target.value }); setErrors({ ...errors, tags: undefined }) }} error={errors.tags} hint="Separate tags with commas (up to 20 tags)." />
            <div className="field">
              <span className="field__label">
                Type: {form.mode === 'flashcards' ? 'Flashcards' : 'Quiz'}, cannot be changed after creation
              </span>
            </div>
          </div>
        </SectionCard>

        {form.mode === 'quiz' && <>
          <SectionCard title="Answers" description="Choose when students see answers and explanations.">
            <RadioGroup label="Answer reveal" name="answer-reveal" value={form.settings.answerReveal} options={revealOptions} onChange={(value) => updateSettings({ answerReveal: value as QuizSettings['answerReveal'] })} error={errors.settings} />
          </SectionCard>
          <SectionCard title="Scores" description="Decide when learners can view their results.">
            <RadioGroup label="Score visibility" name="score-visibility" value={form.settings.scoreVisibility} options={scoreOptions} onChange={(value) => updateSettings({ scoreVisibility: value as QuizSettings['scoreVisibility'] })} />
            {form.settings.scoreVisibility === 'after_release' && <p className="field__hint">You can release scores from the results page when it is available.</p>}
          </SectionCard>
        </>}

        <GroupSettingsSection
          mode={form.mode}
          participation={participation}
          // Teams are paced per question by the server, so the whole-quiz time limit does not apply to them.
          onChange={(next) => {
            updateSettings({ participation: next, ...(next.type === 'group' ? { ...timeLimitFields(null), opensAt: null, closesAt: null } : {}) })
          }}
        />

        <SectionCard title="Timing and attempts" description="Set a pace that supports thoughtful practice.">
          <div className="quiz-editor__settings-grid">
            {isGroupQuiz
              ? <p className="field__hint">Teams are paced per question (see Participation), so there is no whole-quiz time limit.</p>
              : <>
                <label className="choice-control"><input type="checkbox" checked={form.settings.timeLimitMinutes !== null} onChange={(event) => { setMinutesText(null); setSecondsText(null); updateSettings(timeLimitFields(event.target.checked ? 60 : null)) }} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Set a time limit for each question</strong><small>Every question gets its own countdown. Students move on automatically when it runs out.</small></span></label>
                {limitSeconds !== null && <fieldset className="grid min-w-0 gap-2 border-0 p-0">
                  <legend className="field__label mb-2">Time for each question</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Minutes"
                      name="time-limit-minutes"
                      type="number"
                      min={0}
                      value={minutesText ?? String(limitParts.minutes)}
                      onChange={(event) => {
                        setMinutesText(event.target.value)
                        const val = parseInt(event.target.value, 10)
                        updateSettings(timeLimitFields((Number.isNaN(val) ? 0 : Math.max(0, val)) * 60 + limitParts.seconds))
                      }}
                      onBlur={() => setMinutesText(null)}
                    />
                    <Input
                      label="Seconds"
                      name="time-limit-seconds"
                      type="number"
                      min={0}
                      max={59}
                      value={secondsText ?? String(limitParts.seconds)}
                      error={limitProblem ?? undefined}
                      onChange={(event) => {
                        setSecondsText(event.target.value)
                        const val = parseInt(event.target.value, 10)
                        updateSettings(timeLimitFields(limitParts.minutes * 60 + (Number.isNaN(val) ? 0 : Math.min(59, Math.max(0, val)))))
                      }}
                      onBlur={() => setSecondsText(null)}
                    />
                  </div>
                </fieldset>}
              </>}
            <div className="grid gap-3">
              <Select
                label="Attempts allowed"
                name="attempts-allowed"
                value={
                  showCustomAttempts
                    ? 'custom'
                    : form.settings.attemptsAllowed === null
                    ? 'unlimited'
                    : String(form.settings.attemptsAllowed)
                }
                onChange={(event) => {
                  if (event.target.value === 'custom') {
                    setIsCustomAttempts(true)
                    const nextVal = form.settings.attemptsAllowed && form.settings.attemptsAllowed > 0 ? form.settings.attemptsAllowed : 4
                    setCustomAttemptsText(String(nextVal))
                    updateSettings({ attemptsAllowed: nextVal })
                  } else {
                    setIsCustomAttempts(false)
                    setCustomAttemptsText('')
                    updateSettings({ attemptsAllowed: event.target.value === 'unlimited' ? null : Number(event.target.value) })
                  }
                }}
                options={[
                  { label: 'Unlimited', value: 'unlimited' },
                  { label: '1 attempt', value: '1' },
                  { label: '2 attempts', value: '2' },
                  { label: '3 attempts', value: '3' },
                  { label: 'Custom…', value: 'custom' },
                ]}
              />
              {showCustomAttempts && (
                <Input
                  label="Number of attempts"
                  name="custom-attempts"
                  type="number"
                  min={1}
                  value={customAttemptsText}
                  onChange={(event) => {
                    setCustomAttemptsText(event.target.value)
                    const parsed = parseInt(event.target.value, 10)
                    if (!Number.isNaN(parsed) && parsed >= 1) {
                      updateSettings({ attemptsAllowed: parsed })
                    }
                  }}
                  onBlur={(event) => {
                    const parsed = parseInt(event.target.value, 10)
                    if (Number.isNaN(parsed) || parsed < 1) {
                      updateSettings({ attemptsAllowed: 1 })
                      setCustomAttemptsText('1')
                    } else {
                      updateSettings({ attemptsAllowed: parsed })
                      setCustomAttemptsText(String(parsed))
                    }
                  }}
                  hint="Enter any positive number of attempts (e.g., 5, 10)."
                />
              )}
            </div>
            <label className="choice-control"><input type="checkbox" checked={form.settings.shuffleQuestions} onChange={(event) => updateSettings({ shuffleQuestions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle questions</strong></span></label>
            <label className="choice-control"><input type="checkbox" checked={form.settings.shuffleOptions} onChange={(event) => updateSettings({ shuffleOptions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle answer options</strong></span></label>
          </div>
        </SectionCard>

        {!isGroupQuiz && <SectionCard title="Availability and deadline" description="Choose when students can open this quiz. Leave both blank to keep it open whenever it is published.">
          <div className="quiz-editor__settings-grid quiz-editor__settings-grid--availability">
            <DueDateTimeField
              legend="Opens"
              name="quiz-opens"
              defaultTime="00:00"
              hint="Optional · local time. Students cannot open the quiz before this. Clear the date to remove it."
              value={toDateTimeLocal(form.settings.opensAt)}
              onChange={(value) => updateSettings({ opensAt: fromDateTimeLocal(value) })}
              action={
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy-800 underline underline-offset-4 hover:text-navy-950 focus-visible:outline-3 focus-visible:outline-navy-700 cursor-pointer"
                    onClick={() => updateSettings({ opensAt: currentMinute() })}
                  >
                    Set to now
                  </button>
                  {form.settings.opensAt && (
                    <>
                      <span className="text-navy-800-72 text-sm" aria-hidden="true">·</span>
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy-800 underline underline-offset-4 hover:text-navy-950 focus-visible:outline-3 focus-visible:outline-navy-700 cursor-pointer"
                        onClick={() => updateSettings({ opensAt: null })}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              }
            />
            <DueDateTimeField
              legend="Deadline"
              name="quiz-closes"
              hint="Optional · local time; a new date defaults to 11:59 PM. Students cannot start after this, and an attempt in progress is submitted automatically."
              value={toDateTimeLocal(form.settings.closesAt)}
              onChange={(value) => updateSettings({ closesAt: fromDateTimeLocal(value) })}
              action={
                form.settings.closesAt ? (
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center text-sm font-semibold text-navy-800 underline underline-offset-4 hover:text-navy-950 focus-visible:outline-3 focus-visible:outline-navy-700 cursor-pointer"
                    onClick={() => updateSettings({ closesAt: null })}
                  >
                    Clear
                  </button>
                ) : undefined
              }
            />
          </div>
          {windowProblem && <Alert tone="error" label="Check these dates">{windowProblem}</Alert>}
        </SectionCard>}

        <SectionCard title="Questions" description="Add or edit the questions and answer keys for this quiz.">
          <div className="quiz-question-placeholder"><strong>{questionCount} {questionCount === 1 ? 'question' : 'questions'} added</strong>{quizId ? <Button to={`/instructor/quizzes/${quizId}/questions`} variant="secondary">{questionCount > 0 ? 'Edit questions' : 'Add questions'}</Button> : <div className="grid justify-items-start gap-2"><Button type="button" variant="secondary" disabled>Add questions</Button><span className="field__hint">Save your settings first.</span></div>}</div>
        </SectionCard>

        <SectionCard title="How students will experience this quiz"><p className="quiz-experience-summary" aria-live="polite">{experience}</p></SectionCard>
        <div className="quiz-editor__save">{quizId ? <Button type="submit" name="intent" value="save" disabled={saving || !classesLoaded}>{continueToPublish && !saving && classesLoaded ? <ArrowRight size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{saveLabel}</Button> : <><Button type="submit" name="intent" value="save-and-add-questions" disabled={saving || !classesLoaded}><Plus size={17} aria-hidden="true" />{saving ? 'Saving…' : !classesLoaded ? 'Loading classes…' : 'Save and add questions'}</Button><Button type="submit" name="intent" value="save" variant="secondary" disabled={saving || !classesLoaded}><Save size={17} aria-hidden="true" />Save</Button></>}{dirty && <span role="status">Unsaved changes</span>}</div>
      </form>
    </main>
  </AppShell>
}
