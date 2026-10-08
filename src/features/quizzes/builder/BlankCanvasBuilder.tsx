import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Eye, LayoutGrid, Loader2, Save, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { Alert } from '../../../shared/ui/Alert'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { SegmentedControl } from '../../../shared/ui/SegmentedControl'
import { Switch } from '../../../shared/ui/Switch'
import { Textarea } from '../../../shared/ui/Textarea'
import { useToast } from '../../../shared/ui/useToast'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'
import type { CanvasAllowedCardType, CanvasQuestion } from '../../canvas/types'
import { getQuestionWithKey, saveQuestionAndKey } from '../services/questionService'
import { getQuiz, type QuizRecord } from '../services/quizService'

interface Props {
  quizId: string
}

export function BlankCanvasBuilder({ quizId }: Props) {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)

  // Form State
  const [prompt, setPrompt] = useState('Build your concept board.')
  const [rubric, setRubric] = useState('')
  const [showRubricToStudents, setShowRubricToStudents] = useState(true)
  const [points, setPoints] = useState(100)
  const [maxCards, setMaxCards] = useState(20)
  const [maxConnections, setMaxConnections] = useState(40)
  const [allowedCardTypes, setAllowedCardTypes] = useState<CanvasAllowedCardType[]>(['note', 'paragraph', 'link'])
  const [directed, setDirected] = useState(false)

  // UI state
  const [previewTab, setPreviewTab] = useState<'form' | 'empty-board' | 'student-view'>('form')
  const [savedSignature, setSavedSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const currentSignature = useMemo(() => {
    return JSON.stringify({
      prompt: prompt.trim(),
      rubric: rubric.trim(),
      showRubricToStudents,
      points,
      maxCards,
      maxConnections,
      allowedCardTypes: [...allowedCardTypes].sort(),
      directed,
    })
  }, [prompt, rubric, showRubricToStudents, points, maxCards, maxConnections, allowedCardTypes, directed])

  const isDirty = savedSignature !== '' && currentSignature !== savedSignature
  useUnsavedChangesGuard(isDirty)

  // Load quiz and existing 'board' question
  useEffect(() => {
    if (!quizId) return
    let active = true

    async function load() {
      try {
        const foundQuiz = await getQuiz(quizId)
        if (!active) return
        if (!foundQuiz) {
          setLoadError('Quiz not found.')
          setLoading(false)
          return
        }
        setQuiz(foundQuiz)

        const existingPair = await getQuestionWithKey(quizId, 'board')
        if (!active) return

        if (existingPair) {
          const q = existingPair.question as CanvasQuestion
          setPrompt(q.prompt || 'Build your concept board.')
          setRubric(q.rubric || '')
          setShowRubricToStudents(q.showRubricToStudents ?? true)
          setPoints(q.points ?? 100)
          setMaxCards(q.maxCards ?? 20)
          setMaxConnections(q.maxConnections ?? 40)
          setAllowedCardTypes(q.allowedCardTypes ?? ['note', 'paragraph', 'link'])
          setDirected(q.directed ?? false)

          const sig = JSON.stringify({
            prompt: (q.prompt || 'Build your concept board.').trim(),
            rubric: (q.rubric || '').trim(),
            showRubricToStudents: q.showRubricToStudents ?? true,
            points: q.points ?? 100,
            maxCards: q.maxCards ?? 20,
            maxConnections: q.maxConnections ?? 40,
            allowedCardTypes: [...(q.allowedCardTypes ?? ['note', 'paragraph', 'link'])].sort(),
            directed: q.directed ?? false,
          })
          setSavedSignature(sig)
        } else {
          const sig = JSON.stringify({
            prompt: 'Build your concept board.',
            rubric: '',
            showRubricToStudents: true,
            points: 100,
            maxCards: 20,
            maxConnections: 40,
            allowedCardTypes: ['link', 'note', 'paragraph'],
            directed: false,
          })
          setSavedSignature(sig)
        }
        setLoading(false)
      } catch (err) {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Could not load canvas data.')
        setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [quizId])

  const validationErrors = useMemo(() => {
    const errors: string[] = []
    if (!prompt.trim()) errors.push('Instructions are required.')
    if (prompt.trim().length > 2000) errors.push('Instructions cannot exceed 2,000 characters.')
    if (rubric.length > 1000) errors.push('Rubric cannot exceed 1,000 characters.')
    if (!Number.isInteger(points) || points < 1 || points > 1000) errors.push('Points must be an integer between 1 and 1,000.')
    if (!Number.isInteger(maxCards) || maxCards < 1 || maxCards > 30) errors.push('Card limit must be between 1 and 30.')
    if (!Number.isInteger(maxConnections) || maxConnections < 0 || maxConnections > 80) errors.push('Connection limit must be between 0 and 80.')
    if (allowedCardTypes.length === 0) errors.push('Select at least one allowed card type.')
    return errors
  }, [prompt, rubric, points, maxCards, maxConnections, allowedCardTypes])

  const toggleCardType = useCallback((type: CanvasAllowedCardType) => {
    setAllowedCardTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type)
      }
      return [...prev, type]
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (validationErrors.length > 0) {
      showToast('error', validationErrors[0])
      return
    }
    setSaving(true)
    setSaveError(null)

    try {
      const questionData: Record<string, unknown> = {
        order: 0,
        type: 'canvas',
        prompt: prompt.trim(),
        points,
        cards: [],
        showRubricToStudents,
        maxCards,
        maxConnections,
        allowedCardTypes,
        directed,
      }
      if (rubric.trim()) {
        questionData.rubric = rubric.trim()
      }

      await saveQuestionAndKey(quizId, 'board', questionData, null, { boardKind: 'blank' })
      setSavedSignature(currentSignature)
      showToast('success', 'Blank canvas saved.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save blank canvas.'
      setSaveError(msg)
      showToast('error', msg)
    } finally {
      setSaving(false)
    }
  }, [validationErrors, prompt, rubric, points, showRubricToStudents, maxCards, maxConnections, allowedCardTypes, directed, quizId, currentSignature, showToast])

  if (loading) {
    return (
      <AppShell>
        <PageHeader eyebrow="CANVAS BUILDER" title="Loading canvas…" subtitle="" />
        <main className="app-shell__content quiz-editor">
          <div className="quiz-editor-skeleton" aria-label="Loading blank canvas builder" />
        </main>
      </AppShell>
    )
  }

  if (loadError || !quiz) {
    return (
      <AppShell>
        <PageHeader eyebrow="CANVAS BUILDER" title="Canvas unavailable" subtitle="We couldn’t load this canvas board." />
        <main className="app-shell__content quiz-editor">
          <Alert tone="error" label="Canvas not available">{loadError || 'Could not load quiz.'}</Alert>
          <Button to="/instructor/quizzes">Back to all quizzes</Button>
        </main>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="CANVAS BUILDER"
        title={quiz.title || 'Blank canvas board'}
        subtitle="Students build their own boards. You check their work and provide a manual grade."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>You grade</Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(`/instructor/quizzes/${quizId}?tab=settings`)}
            >
              <ArrowLeft size={17} aria-hidden="true" /> Settings
            </Button>
          </div>
        }
      />

      <main className="app-shell__content grid gap-6" id="main-content">
        {/* Workspace navigation */}
        <nav aria-label="Quiz workspace" className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" aria-current="page">
            Questions
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/instructor/quizzes/${quizId}?tab=settings`)}
          >
            Settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/instructor/quizzes/${quizId}?tab=preview`)}
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(`/instructor/quizzes/${quizId}/results`)}
          >
            Results
          </Button>
        </nav>

        {/* Action and status bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={previewTab === 'form' ? 'primary' : 'secondary'}
              onClick={() => setPreviewTab('form')}
            >
              <LayoutGrid size={16} aria-hidden="true" /> Builder form
            </Button>
            <Button
              type="button"
              variant={previewTab === 'empty-board' ? 'primary' : 'secondary'}
              onClick={() => setPreviewTab('empty-board')}
            >
              <Eye size={16} aria-hidden="true" /> Empty-board preview
            </Button>
            <Button
              type="button"
              variant={previewTab === 'student-view' ? 'primary' : 'secondary'}
              onClick={() => setPreviewTab('student-view')}
            >
              <Eye size={16} aria-hidden="true" /> Student-view preview
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                saving ? 'text-navy-700' : isDirty ? 'text-feedback-warning' : 'text-feedback-success'
              }`}
              role="status"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Saving…</span>
                </>
              ) : isDirty ? (
                <>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>Unsaved changes</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Saved</span>
                </>
              )}
            </span>
            <Button
              type="button"
              disabled={saving || validationErrors.length > 0}
              onClick={() => void handleSave()}
            >
              <Save size={16} aria-hidden="true" /> {saving ? 'Saving…' : 'Save blank canvas'}
            </Button>
          </div>
        </div>

        {saveError && (
          <Alert tone="error" label="Could not save canvas">
            {saveError}
          </Alert>
        )}

        {/* Builder Form Tab */}
        {previewTab === 'form' && (
          <div className="grid gap-6">
            <SectionCard
              title="Instructions"
              description="Explain to students what concepts to represent and how to connect them."
            >
              <Textarea
                label="Activity instructions"
                name="blank-instructions"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={2000}
                hint={`${prompt.length}/2000 characters`}
                rows={4}
                required
              />
            </SectionCard>

            <SectionCard
              title="Rubric & grading guidance"
              description="Provide criteria for full credit and choose whether students can see it."
            >
              <div className="grid gap-4">
                <Textarea
                  label="Rubric (optional)"
                  name="blank-rubric"
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                  maxLength={1000}
                  hint={`${rubric.length}/1000 characters`}
                  rows={3}
                />
                <Switch
                  checked={showRubricToStudents}
                  onChange={(e) => setShowRubricToStudents(e.target.checked)}
                  label="Show rubric to students"
                  hint={
                    showRubricToStudents
                      ? 'Students will see this rubric on the intro page and during practice.'
                      : 'Rubric is private to you during grading.'
                  }
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Points & limits"
              description="Set scoring weight and maximum cards/connections to keep boards focused."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  label="Points"
                  name="blank-points"
                  type="number"
                  min={1}
                  max={1000}
                  value={String(points)}
                  onChange={(e) => setPoints(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                  hint="Maximum score for this board"
                />
                <Input
                  label="Card limit (max 30)"
                  name="blank-max-cards"
                  type="number"
                  min={1}
                  max={30}
                  value={String(maxCards)}
                  onChange={(e) => setMaxCards(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                  hint="Cards student can create (1–30)"
                />
                <Input
                  label="Connection limit (max 80)"
                  name="blank-max-connections"
                  type="number"
                  min={0}
                  max={80}
                  value={String(maxConnections)}
                  onChange={(e) => setMaxConnections(Math.max(0, Math.min(80, Number(e.target.value) || 0)))}
                  hint="Connections student can draw (0–80)"
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Allowed card types"
              description="Select which kinds of cards students can add to their boards."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="choice-control">
                  <input
                    type="checkbox"
                    checked={allowedCardTypes.includes('note')}
                    onChange={() => toggleCardType('note')}
                  />
                  <span className="choice-control__mark" aria-hidden="true" />
                  <span className="choice-control__copy">
                    <strong>Note card</strong>
                    <small>Concise title and bulleted note text</small>
                  </span>
                </label>

                <label className="choice-control">
                  <input
                    type="checkbox"
                    checked={allowedCardTypes.includes('paragraph')}
                    onChange={() => toggleCardType('paragraph')}
                  />
                  <span className="choice-control__mark" aria-hidden="true" />
                  <span className="choice-control__copy">
                    <strong>Paragraph card</strong>
                    <small>Detailed text explanation or summary</small>
                  </span>
                </label>

                <label className="choice-control">
                  <input
                    type="checkbox"
                    checked={allowedCardTypes.includes('link')}
                    onChange={() => toggleCardType('link')}
                  />
                  <span className="choice-control__mark" aria-hidden="true" />
                  <span className="choice-control__copy">
                    <strong>Link card</strong>
                    <small>External HTTPS reference link</small>
                  </span>
                </label>
              </div>
            </SectionCard>
            <SectionCard
              title="Connection style"
              description="Choose whether student connections are directed (with arrows) or undirected relationships."
            >
              <div className="max-w-md">
                <SegmentedControl
                  label="Connection direction"
                  value={directed ? 'directed' : 'undirected'}
                  options={[
                    { label: 'Undirected (default)', value: 'undirected' },
                    { label: 'Directed (arrows)', value: 'directed' },
                  ]}
                  onChange={(val) => setDirected(val === 'directed')}
                />
              </div>
            </SectionCard>
          </div>
        )}

        {/* Read-Only Empty Board Preview */}
        {previewTab === 'empty-board' && (
          <div className="grid gap-4">
            <div className="p-4 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
              <h3 className="m-0 text-base font-semibold text-navy-900">Empty-board preview</h3>
              <p className="m-0 text-sm text-navy-800-72 mt-1">
                Students will start with a completely empty canvas and build their concept map from scratch.
              </p>
            </div>
            <div className="h-[420px] w-full rounded-2xl border border-navy-900-12 bg-navy-50 flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md bg-white p-6 rounded-2xl border border-navy-900-12 shadow-sm">
                <h4 className="m-0 text-base font-semibold text-navy-900">Blank student canvas</h4>
                <p className="m-0 text-sm text-navy-800-72 mt-2">
                  {prompt}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Badge>Up to {maxCards} cards</Badge>
                  <Badge>Up to {maxConnections} connections</Badge>
                  <Badge>{directed ? 'Directed' : 'Undirected'}</Badge>
                  <Badge>{points} points</Badge>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Student View Preview */}
        {previewTab === 'student-view' && (
          <div className="grid gap-4">
            <div className="p-4 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
              <h3 className="m-0 text-base font-semibold text-navy-900">Student view preview</h3>
              <p className="m-0 text-sm text-navy-800-72 mt-1">
                Here is what students will see when they work on this blank canvas board.
              </p>
            </div>

            {/* Mock instructions & rubric */}
            <div className="rounded-2xl border border-navy-900-12 bg-white p-4 shadow-sm">
              <span className="block text-sm font-bold uppercase tracking-wider text-navy-800-72">Instructions</span>
              <p className="m-0 text-base font-medium text-navy-900 mt-1 whitespace-pre-wrap">{prompt}</p>
              {showRubricToStudents && rubric && (
                <div className="mt-3 pt-3 border-t border-navy-900-12">
                  <span className="block text-sm font-bold uppercase tracking-wider text-navy-800-72">Rubric</span>
                  <p className="m-0 text-sm text-navy-800 mt-1 whitespace-pre-wrap">{rubric}</p>
                </div>
              )}
            </div>

            {/* Mock toolbar & board */}
            <div className="p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-navy-800-72 mr-1">Add:</span>
                {allowedCardTypes.map((type) => (
                  <Button key={type} type="button" variant="secondary" disabled>
                    + {type[0].toUpperCase() + type.slice(1)}
                  </Button>
                ))}
                <Button type="button" variant="secondary" disabled>Connect cards</Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-navy-800-72 font-medium">
                <span>0 of {maxCards} cards</span>
                <span>·</span>
                <span>0 of {maxConnections} connections</span>
              </div>
            </div>

            <div className="h-[380px] w-full rounded-2xl border border-navy-900-12 bg-navy-50 flex items-center justify-center text-center p-4">
              <p className="text-sm text-navy-800-72 font-medium m-0">
                Student drawing canvas area. Students can drag to add cards, connect them, and arrange concepts.
              </p>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  )
}
