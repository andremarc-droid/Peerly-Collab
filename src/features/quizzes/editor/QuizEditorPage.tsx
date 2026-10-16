import { ArrowLeft, ArrowRight, Plus, Save } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { defaultQuizSettings } from '../schemas/settings'
import { DueDateTimeField } from '../../assignments/DueDateTimeField'
import { effectiveTimeLimitSeconds, fromDateTimeLocal, splitSeconds, timeLimitFields, timingProblem, toDateTimeLocal } from '../quizTiming'
import { createQuiz, duplicateQuiz, getQuiz, hasQuizAttemptsOrParticipants, updateQuiz } from '../services'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import type { QuizSettings, QuizStatus } from '../types'
import { validateQuizForm, type QuizFormErrors, type QuizFormValues } from './validation'
import { GroupSettingsSection } from './GroupSettingsSection'
import { describeQuizExperience } from './quizExperience'
import { QuizPublishTab } from './QuizPublishTab'
import { QuizWorkflowNav, quizStepPath } from './QuizWorkflowNav'
import { QuickCreateQuiz } from '../authoring/QuickCreateQuiz'
const QuestionBuilderPage = lazy(() => import('../builder/QuestionBuilderPage').then((module) => ({ default: module.QuestionBuilderPage })))
const CanvasBuilderPage = lazy(() => import('../builder/CanvasBuilderPage'))

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
  const [hasSubmissions, setHasSubmissions] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])
  useUnsavedChangesGuard(dirty)

  useEffect(() => {
    if (!ownerId) return undefined
    return watchMyClasses(ownerId, (items) => { setClasses(items); setClassesLoaded(true) }, (reason) => { setLoadError(reason.message); setClassesLoaded(true) })
  }, [ownerId])

  useEffect(() => {
    if (!quizId) return
    let active = true
    getQuiz(quizId).then((quiz) => {
      if (!active) return
      if (!quiz) { setLoadError('This quiz could not be found.'); setResolvedQuizId(quizId); return }
      const values = { classId: quiz.classId ?? '', title: quiz.title, description: quiz.description, tags: quiz.tags.join(', '), mode: quiz.mode, boardKind: quiz.boardKind, settings: quiz.settings }
      setForm(values); setSaved(values); setQuestionCount(quiz.questionCount); setStatus(quiz.status); setResolvedQuizId(quizId)
      void hasQuizAttemptsOrParticipants(quizId).then((result) => {
        if (active) setHasSubmissions(result)
      })
    }).catch((reason: unknown) => {
      if (active) { setLoadError(reason instanceof Error ? reason.message : 'This quiz could not be loaded.'); setResolvedQuizId(quizId) }
    })
    return () => { active = false }
  }, [quizId])

  function updateSettings(patch: Partial<QuizSettings>) {
    setForm((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }

  const backPath = form.classId ? `/instructor/classes/${form.classId}` : '/instructor/quizzes'
  function leaveEditor() {
    if (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) navigate(backPath)
  }

  // A draft moves straight on to Preview & publish after its settings are saved. Published or locked quizzes just save.
  const continueToPublish = status === 'draft' && !hasSubmissions

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
    const input = { ...(!quizId || classAssignmentChanged ? { classId: form.classId } : {}), title: form.title.trim(), description: form.description.trim(), tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), settings: form.settings }
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
    if (form.mode === 'canvas') {
      return (
        <Suspense fallback={<div className="quiz-editor-skeleton" aria-label="Loading canvas builder" />}>
          <CanvasBuilderPage quizId={quizId} />
        </Suspense>
      )
    }
    return <QuestionBuilderPage />
  }
  // "preview" is the old name of the final step; old links keep working.
  if (activeTab === 'publish' || activeTab === 'preview') return <QuizPublishTab quizId={quizId} />

  const participation = form.settings.participation
  const isGroupQuiz = form.mode === 'quiz' && participation.type === 'group'
  const limitSeconds = effectiveTimeLimitSeconds(form.settings)
  const limitParts = splitSeconds(limitSeconds ?? 0)
  const limitProblem = limitSeconds === null ? null : timingProblem({ timeLimitMinutes: form.settings.timeLimitMinutes, timeLimitSeconds: limitSeconds })
  const windowProblem = timingProblem({ timeLimitMinutes: null, opensAt: form.settings.opensAt, closesAt: form.settings.closesAt })
  const experience = describeQuizExperience({ mode: form.mode, boardKind: form.boardKind, title: form.title, settings: form.settings })
  const saveLabel = saving ? 'Saving…' : !classesLoaded ? 'Loading classes…' : continueToPublish ? 'Save and continue' : 'Save settings'

  return <AppShell>
    <PageHeader eyebrow={quizId ? 'EDIT QUIZ' : 'NEW QUIZ'} title={quizId ? 'Quiz settings.' : 'Create a quiz.'} subtitle={continueToPublish ? 'Choose how students take this quiz. Next you will preview and publish it.' : 'Choose how students take this quiz.'} action={<Button type="button" variant="secondary" onClick={leaveEditor}><ArrowLeft size={17} aria-hidden="true" /> Back</Button>} />
    <main className="app-shell__content quiz-editor" id="main-content">
      <QuizWorkflowNav quizId={quizId} current="settings" hasTeams={isGroupQuiz} />
      {saveError && <Alert tone="error" label="Could not save changes">{saveError}</Alert>}
      {quizId && (!form.classId || (classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active'))) && <Alert tone="warning" label="Assign this quiz to a class">Choose an active class below and save to keep this quiz in the classroom catalog.</Alert>}
      {classesLoaded && !classes.some((item) => item.status === 'active') && <Alert tone="warning" label="Create a class first">Quizzes must belong to an active class. <Button to="/instructor" variant="secondary">Create a class</Button></Alert>}
      {hasSubmissions && (
        <div className="mb-4">
          <Alert
            tone="warning"
            label="Settings locked"
            action={
              <Button
                type="button"
                variant="secondary"
                disabled={duplicating}
                onClick={async () => {
                  setDuplicating(true)
                  try {
                    const copyId = await duplicateQuiz(quizId)
                    showToast('success', 'Quiz duplicated as a draft.')
                    navigate(`/instructor/quizzes/${copyId}?tab=settings`)
                  } catch (err) {
                    showToast('error', err instanceof Error ? err.message : 'Could not duplicate quiz')
                  } finally {
                    setDuplicating(false)
                  }
                }}
              >
                {duplicating ? 'Duplicating…' : 'Duplicate quiz'}
              </Button>
            }
          >
            This quiz already has student attempts or participants. Timing, participation, and shuffle settings are locked to protect student results. Duplicate this quiz to modify them.
          </Alert>
        </div>
      )}
      <form className="quiz-editor__form" onSubmit={handleSave} noValidate>
        <SectionCard title="Basics" description="Give learners a clear idea of what they’ll practice.">
          <div className="quiz-editor__fields">
            <Select label="Class" name="quiz-class" value={classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active') ? '' : form.classId} onChange={(event) => { setForm({ ...form, classId: event.target.value }); setErrors({ ...errors, classId: undefined }) }} options={[{ label: classesLoaded ? 'Choose an active class' : 'Loading classes…', value: '' }, ...classes.filter((item) => item.status === 'active').map((item) => ({ label: item.name, value: item.id }))]} error={errors.classId} required hint="Quizzes are published to one class at a time." />
            <Input label="Quiz title" name="quiz-title" value={form.title} onChange={(event) => { setForm({ ...form, title: event.target.value }); setErrors({ ...errors, title: undefined }) }} error={errors.title} required maxLength={120} />
            <label className="field" htmlFor="quiz-description"><span className="field__label">Description</span><textarea id="quiz-description" className="field__control quiz-editor__textarea" value={form.description} onChange={(event) => { setForm({ ...form, description: event.target.value }); setErrors({ ...errors, description: undefined }) }} rows={3} maxLength={2000} /></label>
            <Input label="Tags" name="quiz-tags" value={form.tags} onChange={(event) => { setForm({ ...form, tags: event.target.value }); setErrors({ ...errors, tags: undefined }) }} error={errors.tags} hint="Separate tags with commas (up to 20 tags)." />
            <div className="field">
              <span className="field__label">
                Type: {form.mode === 'canvas' ? `Canvas (${form.boardKind === 'blank' ? 'Blank board' : 'Pre-built board'})` : form.mode === 'flashcards' ? 'Flashcards' : 'Quiz'}, cannot be changed after creation
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

        {form.mode === 'canvas' && form.boardKind !== 'blank' && (
          <SectionCard title="Submission review" description="Choose what students see after submitting their canvas board.">
            <RadioGroup
              label="After submitting"
              name="canvas-review-setting"
              value={form.settings.scoreVisibility === 'immediate' && form.settings.answerReveal !== 'never' ? 'review' : 'submitted'}
              options={[
                { value: 'review', label: 'Students see their score and review', hint: 'Shows score and correct/incorrect connections upon submission.' },
                { value: 'submitted', label: 'Students see only that it was submitted', hint: 'Holds back score and answers until you release them.' },
              ]}
              onChange={(value) => {
                updateSettings({
                  scoreVisibility: value === 'review' ? 'immediate' : 'after_release',
                  answerReveal: value === 'review' ? 'after_submit' : 'never',
                })
              }}
            />
          </SectionCard>
        )}

        <GroupSettingsSection
          mode={form.mode}
          participation={participation}
          disabled={hasSubmissions}
          // Teams are paced per question by the server, so the whole-quiz time limit does not apply to them.
          onChange={(next) => {
            if (!hasSubmissions) updateSettings({ participation: next, ...(next.type === 'group' ? { ...timeLimitFields(null), opensAt: null, closesAt: null } : {}) })
          }}
        />

        <SectionCard title="Timing and attempts" description="Set a pace that supports thoughtful practice.">
          <div className="quiz-editor__settings-grid">
            {isGroupQuiz
              ? <p className="field__hint">Teams are paced per question (see Participation), so there is no whole-quiz time limit.</p>
              : <>
                <label className="choice-control"><input type="checkbox" disabled={hasSubmissions} checked={form.settings.timeLimitMinutes !== null} onChange={(event) => updateSettings(timeLimitFields(event.target.checked ? 600 : null))} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Set a time limit</strong><small>Optional time for the quiz.</small></span></label>
                {limitSeconds !== null && <fieldset className="grid min-w-0 gap-2 border-0 p-0" disabled={hasSubmissions}>
                  <legend className="field__label mb-2">Time limit</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Minutes" name="time-limit-minutes" type="number" min={0} value={String(limitParts.minutes)} onChange={(event) => updateSettings(timeLimitFields(Math.max(0, Math.floor(Number(event.target.value) || 0)) * 60 + limitParts.seconds))} />
                    <Input label="Seconds" name="time-limit-seconds" type="number" min={0} max={59} value={String(limitParts.seconds)} error={limitProblem ?? undefined} onChange={(event) => updateSettings(timeLimitFields(limitParts.minutes * 60 + Math.min(59, Math.max(0, Math.floor(Number(event.target.value) || 0)))))} />
                  </div>
                </fieldset>}
              </>}
            <Select label="Attempts allowed" name="attempts-allowed" value={form.settings.attemptsAllowed === null ? 'unlimited' : String(form.settings.attemptsAllowed)} onChange={(event) => updateSettings({ attemptsAllowed: event.target.value === 'unlimited' ? null : Number(event.target.value) })} options={[{ label: 'Unlimited', value: 'unlimited' }, { label: '1 attempt', value: '1' }, { label: '2 attempts', value: '2' }, { label: '3 attempts', value: '3' }]} />
            <label className="choice-control"><input type="checkbox" disabled={hasSubmissions} checked={form.settings.shuffleQuestions} onChange={(event) => updateSettings({ shuffleQuestions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle questions</strong></span></label>
            <label className="choice-control"><input type="checkbox" disabled={hasSubmissions} checked={form.settings.shuffleOptions} onChange={(event) => updateSettings({ shuffleOptions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle answer options</strong></span></label>
          </div>
        </SectionCard>

        {!isGroupQuiz && <SectionCard title="Availability and deadline" description="Choose when students can open this quiz. Leave both blank to keep it open whenever it is published.">
          <div className="quiz-editor__settings-grid">
            <DueDateTimeField legend="Opens" name="quiz-opens" defaultTime="00:00" hint="Optional · local time. Students cannot open the quiz before this. Clear the date to remove it." value={toDateTimeLocal(form.settings.opensAt)} onChange={(value) => updateSettings({ opensAt: fromDateTimeLocal(value) })} />
            <DueDateTimeField legend="Deadline" name="quiz-closes" hint="Optional · local time; a new date defaults to 11:59 PM. Students cannot start after this, and an attempt in progress is submitted automatically." value={toDateTimeLocal(form.settings.closesAt)} onChange={(value) => updateSettings({ closesAt: fromDateTimeLocal(value) })} />
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
