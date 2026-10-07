import { ArrowLeft, Plus, Save } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { createQuiz, getQuiz, updateQuiz, watchQuestionPairs, type SavedQuestion } from '../services'
import { watchMyClasses } from '../../classes/services/classService'
import type { ClassWithId } from '../../classes/types'
import type { QuizMode, QuizSettings } from '../types'
import { validateQuizForm, type QuizFormErrors, type QuizFormValues } from './validation'
import { QuickCreateQuiz } from '../authoring/QuickCreateQuiz'
const QuestionBuilderPage = lazy(() => import('../builder/QuestionBuilderPage').then((module) => ({ default: module.QuestionBuilderPage })))
const CanvasBuilderPage = lazy(() => import('../builder/CanvasBuilderPage'))
const CanvasBoard = lazy(() => import('../../canvas/components/CanvasBoard'))
import { ExpandableCanvasContainer } from '../../canvas/components/ExpandableCanvasContainer'
import { toDataUrl } from '../../canvas/imageProcessing'
import { listImages } from '../../canvas/imageService'

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
  const [resolvedQuizId, setResolvedQuizId] = useState<string | null>(null)
  const loading = Boolean(quizId && resolvedQuizId !== quizId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<QuizFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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
      setForm(values); setSaved(values); setQuestionCount(quiz.questionCount); setResolvedQuizId(quizId)
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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitIntent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value')
    const addQuestionsAfterSave = submitIntent === 'save-and-add-questions'
    const validation = validateQuizForm(form)
    if (form.classId && classesLoaded && !classes.some((item) => item.id === form.classId && item.status === 'active')) validation.classId = 'Choose an active class before saving this quiz.'
    setErrors(validation)
    if (Object.keys(validation).length) return
    if (!user) return
    setSaving(true); setSaveError(null)
    const input = { classId: form.classId, title: form.title.trim(), description: form.description.trim(), tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), settings: form.settings }
    try {
      if (quizId) {
        await updateQuiz(quizId, input)
        setSaved(form); showToast('success', 'Quiz settings saved.')
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
  if (activeTab === 'preview') return <QuizPreviewTab quizId={quizId} />

  const experience = form.mode === 'flashcards'
    ? `Students will review ${form.title.trim() || 'this set'} as flashcards and self-rate their recall.`
    : form.mode === 'canvas'
    ? form.boardKind === 'blank'
      ? `Students will create their own concept board from a blank canvas. You will review and grade their submissions.`
      : `Students will connect cards on the canvas board individually.`
    : `Students will answer ${form.title.trim() || 'this quiz'} individually${form.settings.timeLimitMinutes ? ` with ${form.settings.timeLimitMinutes} minutes` : ''}${form.settings.attemptsAllowed ? ` and ${form.settings.attemptsAllowed} ${form.settings.attemptsAllowed === 1 ? 'attempt' : 'attempts'}` : ' with unlimited attempts'}${form.settings.answerReveal === 'after_each' ? ', seeing explanations after each answer.' : form.settings.answerReveal === 'after_submit' ? ', reviewing explanations after they submit.' : ', with answers hidden.'}`

  return <AppShell>
    <PageHeader eyebrow={quizId ? 'EDIT QUIZ' : 'NEW QUIZ'} title={quizId ? 'Quiz settings.' : 'Create a quiz.'} subtitle="Set up the practice experience. Questions can be added in the next step." action={<Button type="button" variant="secondary" onClick={leaveEditor}><ArrowLeft size={17} aria-hidden="true" /> Back</Button>} />
    <main className="app-shell__content quiz-editor" id="main-content">
      <nav aria-label="Quiz workspace" className="mb-4 flex flex-wrap gap-2"><Button to={`/instructor/quizzes/${quizId}?tab=questions`} variant="secondary">Questions</Button><Button to={`/instructor/quizzes/${quizId}?tab=settings`} aria-current="page" variant="secondary">Settings</Button><Button to={`/instructor/quizzes/${quizId}?tab=preview`} variant="secondary">Preview</Button><Button to={`/instructor/quizzes/${quizId}/results`} variant="ghost">Results</Button></nav>
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

        <SectionCard title="Participation" description="Choose whether learners answer alone or together.">
          <fieldset className="quiz-mode-picker"><legend>How students participate</legend><div className="quiz-mode-picker__grid">
            <label className="quiz-mode-card is-selected"><input type="radio" name="participation" value="individual" checked readOnly /><strong>Individual</strong><span>Each student completes their own attempt.</span></label>
            <label className="quiz-mode-card is-disabled"><input type="radio" name="participation" value="group" disabled /><strong>Group of 2 or more</strong><span>Shared answers and group sessions.</span><span className="coming-soon">Coming soon</span></label>
          </div></fieldset>
          <label className="field" htmlFor="disabled-group-size"><span className="field__label">Group size · Coming soon</span><input id="disabled-group-size" className="field__control" type="number" min={2} max={10} value={2} disabled /></label>
        </SectionCard>

        <SectionCard title="Timing and attempts" description="Set a pace that supports thoughtful practice.">
          <div className="quiz-editor__settings-grid">
            <label className="choice-control"><input type="checkbox" checked={form.settings.timeLimitMinutes !== null} onChange={(event) => updateSettings({ timeLimitMinutes: event.target.checked ? 10 : null })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Set a time limit</strong><small>Optional time for the quiz.</small></span></label>
            {form.settings.timeLimitMinutes !== null && <Input label="Time limit in minutes" name="time-limit" type="number" min={1} value={String(form.settings.timeLimitMinutes)} onChange={(event) => updateSettings({ timeLimitMinutes: Math.max(1, Number(event.target.value) || 1) })} />}
            <Select label="Attempts allowed" name="attempts-allowed" value={form.settings.attemptsAllowed === null ? 'unlimited' : String(form.settings.attemptsAllowed)} onChange={(event) => updateSettings({ attemptsAllowed: event.target.value === 'unlimited' ? null : Number(event.target.value) })} options={[{ label: 'Unlimited', value: 'unlimited' }, { label: '1 attempt', value: '1' }, { label: '2 attempts', value: '2' }, { label: '3 attempts', value: '3' }]} />
            <label className="choice-control"><input type="checkbox" checked={form.settings.shuffleQuestions} onChange={(event) => updateSettings({ shuffleQuestions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle questions</strong></span></label>
            <label className="choice-control"><input type="checkbox" checked={form.settings.shuffleOptions} onChange={(event) => updateSettings({ shuffleOptions: event.target.checked })} /><span className="choice-control__mark" aria-hidden="true" /><span className="choice-control__copy"><strong>Shuffle answer options</strong></span></label>
          </div>
        </SectionCard>

        <SectionCard title="Questions" description="Build questions and answer keys after saving these settings.">
          <div className="quiz-question-placeholder"><strong>{questionCount} {questionCount === 1 ? 'question' : 'questions'} added</strong>{quizId ? <Button to={`/instructor/quizzes/${quizId}/questions`} variant="secondary">{questionCount > 0 ? 'Edit questions' : 'Add questions'}</Button> : <div className="grid justify-items-start gap-2"><Button type="button" variant="secondary" disabled>Add questions</Button><span className="field__hint">Save your settings first.</span></div>}</div>
        </SectionCard>

        <SectionCard title="How students will experience this quiz"><p className="quiz-experience-summary" aria-live="polite">{experience}</p></SectionCard>
        <div className="quiz-editor__save">{quizId ? <Button type="submit" name="intent" value="save" disabled={saving || !classesLoaded}><Save size={17} aria-hidden="true" />{saving ? 'Saving…' : !classesLoaded ? 'Loading classes…' : 'Save settings'}</Button> : <><Button type="submit" name="intent" value="save-and-add-questions" disabled={saving || !classesLoaded}><Plus size={17} aria-hidden="true" />{saving ? 'Saving…' : !classesLoaded ? 'Loading classes…' : 'Save and add questions'}</Button><Button type="submit" name="intent" value="save" variant="secondary" disabled={saving || !classesLoaded}><Save size={17} aria-hidden="true" />Save</Button></>}{dirty && <span role="status">Unsaved changes</span>}</div>
      </form>
    </main>
  </AppShell>
}

function QuizPreviewTab({ quizId }: { quizId: string }) {
  const [title, setTitle] = useState('Quiz preview')
  const [mode, setMode] = useState<QuizMode>('quiz')
  const [items, setItems] = useState<SavedQuestion[]>([])
  const [canvasImages, setCanvasImages] = useState<Record<string, { dataUrl: string; alt?: string }>>({})
  const [canvasImagesError, setCanvasImagesError] = useState(false)

  const loadCanvasImages = useCallback(async () => {
    if (!quizId) return
    setCanvasImagesError(false)
    try {
      const imgList = await listImages(quizId)
      const rec: Record<string, { dataUrl: string; alt?: string }> = {}
      imgList.forEach((img) => {
        rec[img.id] = { dataUrl: toDataUrl(img.mimeType, img.data) }
      })
      setCanvasImages(rec)
    } catch {
      setCanvasImagesError(true)
    }
  }, [quizId])

  useEffect(() => {
    let active = true
    void getQuiz(quizId).then((quiz) => {
      if (active && quiz) {
        setTitle(quiz.title || 'Quiz preview')
        setMode(quiz.mode)
      }
    })
    const stop = watchQuestionPairs(
      quizId,
      (questions) => {
        if (active) {
          setItems(questions)
          const cq = questions.find((item) => item.question.type === 'canvas')?.question as import('../../canvas/types').CanvasQuestion | undefined
          if (cq?.cards?.some((c) => c.type === 'image' && c.imageId)) {
            void loadCanvasImages()
          }
        }
      },
      () => undefined,
    )
    return () => { active = false; stop() }
  }, [quizId, loadCanvasImages])

  const canvasQuestion = items.find((item) => item.question.type === 'canvas')?.question as import('../../canvas/types').CanvasQuestion | undefined

  return (
    <AppShell>
      <PageHeader
        eyebrow="QUIZ PREVIEW"
        title={title}
        subtitle={mode === 'canvas' ? 'A student-facing preview of the canvas board.' : 'A student-facing preview of your current questions.'}
        action={<Button to={`/instructor/quizzes/${quizId}?tab=settings`} variant="secondary">Settings</Button>}
      />
      <main className="app-shell__content quiz-editor">
        <nav aria-label="Quiz workspace" className="flex flex-wrap gap-2">
          <Button to={`/instructor/quizzes/${quizId}?tab=questions`} variant="secondary">Questions</Button>
          <Button to={`/instructor/quizzes/${quizId}?tab=settings`} variant="secondary">Settings</Button>
          <span className="section-kicker">Preview</span>
          <Button to={`/instructor/quizzes/${quizId}/results`} variant="secondary">Results</Button>
        </nav>
        {mode === 'canvas' ? (
          <div className="mt-4 grid gap-4">
            <p className="text-sm text-navy-800-72">{canvasQuestion?.prompt || 'Connect the cards according to the activity instructions.'}</p>
            <ExpandableCanvasContainer title="Canvas preview">
              <div className="w-full h-full rounded-2xl border border-navy-900-12 overflow-hidden bg-navy-50">
                <Suspense fallback={<div className="quiz-editor-skeleton" aria-label="Loading canvas preview" />}>
                  <CanvasBoard
                    cards={canvasQuestion?.cards ?? []}
                    connections={[]}
                    mode="play"
                    directed={canvasQuestion?.directed ?? true}
                    images={canvasImages}
                    className="w-full h-full"
                  />
                </Suspense>
              </div>
            </ExpandableCanvasContainer>
            {canvasImagesError && (
              <div className="flex items-center gap-2 text-sm text-navy-800 bg-navy-50 border border-navy-900-12 rounded-xl px-3 py-2" role="status">
                <span>Some board images could not be loaded.</span>
                <button
                  type="button"
                  onClick={() => void loadCanvasImages()}
                  className="underline font-medium hover:text-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-600 rounded"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p>Students answer {items.length} {items.length === 1 ? 'question' : 'questions'} with answers {items.length ? 'according to the quiz settings' : 'once you add them'}.</p>
            <ol className="grid gap-4">
              {items.map(({ id, question }) => (
                <li key={id} className="rounded-2xl border border-navy-200 p-4">
                  <strong>{question.prompt}</strong>
                  {'options' in question && (
                    <ul>{question.options.map((option) => <li key={option.id}>{option.text}</li>)}</ul>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </main>
    </AppShell>
  )
}
