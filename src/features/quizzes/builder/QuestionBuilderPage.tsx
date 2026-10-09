import { ArrowLeft, ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { resolveListStatus } from '../../../shared/ui/listState'
import { useToast } from '../../../shared/ui/useToast'
import { deleteQuestion, getQuiz, publishQuiz, reorderQuestions, saveQuestionAndKey, watchQuestionPairs, type SavedQuestion } from '../services'
import type { QuestionType, QuizMode } from '../types'
import { QuestionForm, QuestionPreview } from './QuestionForm'
import { createQuestionDraft, draftFromPair, moveQuestion, toQuestionPair, validateQuestionDraft, type QuestionDraft } from './questionDraft'

type SaveStatus = 'saved' | 'waiting' | 'saving' | 'error'

export function QuestionBuilderPage() {
  const { quizId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof getQuiz>>>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<SavedQuestion[]>([])
  const [draft, setDraft] = useState<QuestionDraft | null>(null)
  const [questionId, setQuestionId] = useState<string | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedQuestion | null>(null)
  const [publishBusy, setPublishBusy] = useState(false)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    if (!quizId) return
    let active = true
    getQuiz(quizId).then((result) => {
      if (!active) return
      if (!result || result.ownerId !== user?.uid) setLoadError('This quiz is unavailable or you are not its owner.')
      else setQuiz(result)
      setLoading(false)
    }).catch((reason: unknown) => { if (active) { setLoadError(reason instanceof Error ? reason.message : 'Could not load this quiz.'); setLoading(false) } })
    return () => { active = false }
  }, [quizId, user?.uid])

  useEffect(() => {
    if (!quiz || !quizId) return
    return watchQuestionPairs(quizId, (items) => setQuestions(items), (reason) => setLoadError(reason.message))
  }, [quiz, quizId])

  useEffect(() => {
    if (!quiz || searchParams.get('newQuestion') !== '1' || draft) return
    setDraft(createQuestionDraft(quiz.mode === 'flashcards' ? 'flashcard' : 'multiple_choice', 0))
    setQuestionId(null); setSavedSignature(null); setSaveStatus('waiting')
    searchParams.delete('newQuestion'); setSearchParams(searchParams, { replace: true })
  }, [quiz, searchParams, draft, setSearchParams])

  useEffect(() => {
    if (!draft || !quiz || !user) return
    const signature = JSON.stringify(draft)
    if (savedSignature === signature) return
    if (Object.keys(validateQuestionDraft(draft, quiz.mode)).length > 0) return
    const timer = window.setTimeout(() => {
      setSaveStatus('saving'); setSaveError(null)
      const currentOrder = questionId ? Math.max(0, questions.findIndex((question) => question.id === questionId)) : questions.length
      const pair = toQuestionPair(draft, currentOrder)
      void saveQuestionAndKey(quizId, questionId, pair.question, pair.answerKey)
        .then((savedId) => { setQuestionId(savedId); setSavedSignature(signature); setSaveStatus('saved') })
        .catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : 'Question could not be saved.'
          setSaveError(message); setSaveStatus('error'); showToast('error', message)
        })
    }, 650)
    return () => window.clearTimeout(timer)
  }, [draft, quiz, user, quizId, questionId, questions, savedSignature, showToast])

  const checklist = useMemo(() => ({
    title: Boolean(quiz?.title.trim()),
    question: questions.length > 0,
    valid: questions.length > 0 && questions.every(({ question, answerKey }) => Boolean(answerKey && Object.keys(validateQuestionDraft(draftFromPair(question, answerKey), quiz?.mode ?? 'quiz')).length === 0)),
  }), [quiz, questions])
  const hasPendingQuestion = Boolean(draft && (savedSignature !== JSON.stringify(draft) || saveStatus !== 'saved'))
  const canPublish = checklist.title && checklist.question && checklist.valid && !hasPendingQuestion && !loadError
  const checklistItems = [
    { complete: checklist.title, label: 'Quiz title added' },
    { complete: checklist.question, label: 'At least one question' },
    { complete: checklist.valid, label: 'All questions valid' },
  ]

  function selectQuestion(question: SavedQuestion) {
    if (!question.answerKey) return
    const next = draftFromPair(question.question, question.answerKey)
    setQuestionId(question.id); setDraft(next); setSavedSignature(JSON.stringify(next)); setSaveStatus('saved'); setSaveError(null)
  }

  function addQuestion(type: QuestionType) {
    setQuestionId(null); setDraft(createQuestionDraft(type, questions.length)); setSavedSignature(null); setSaveStatus('waiting'); setSaveError(null)
  }

  function duplicateQuestion(question: SavedQuestion) {
    if (!question.answerKey) return
    const next = draftFromPair(question.question, question.answerKey)
    if (next.type === 'multiple_choice' || next.type === 'true_false') next.options = next.options.map((option, index) => ({ ...option, id: `copy-${Date.now()}-${index}` }))
    next.prompt = `${next.prompt} (copy)`
    setQuestionId(null); setDraft(next); setSavedSignature(null); setSaveStatus('waiting')
  }

  async function deleteSelectedQuestion() {
    if (!deleteTarget) return
    try {
      await deleteQuestion(quizId, deleteTarget.id)
      if (questionId === deleteTarget.id) { setQuestionId(null); setDraft(null); setSavedSignature(null) }
      showToast('success', 'Question deleted.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Question could not be deleted.') }
    setDeleteTarget(null)
  }

  async function move(id: string, offset: number) {
    const from = questions.findIndex((question) => question.id === id)
    const reordered = moveQuestion(questions, from, from + offset)
    if (reordered === questions) return
    try { await reorderQuestions(quizId, reordered.map((question) => question.id)) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Questions could not be reordered.') }
  }

  async function publish() {
    if (!canPublish || !quiz) return
    setPublishBusy(true)
    try {
      await publishQuiz(quizId)
      showToast('success', 'Quiz published and ready for students.')
      navigate(quiz.classId ? `/instructor/classes/${quiz.classId}?tab=${quiz.mode === 'canvas' ? 'canvas' : 'quizzes'}` : '/instructor/quizzes')
    }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Quiz could not be published.') }
    finally { setPublishBusy(false) }
  }

  if (loading) return <AppShell><PageHeader eyebrow="QUESTION BUILDER" title="Loading quiz…" subtitle="" /><main className="app-shell__content question-builder"><Skeleton label="Loading quiz questions" className="question-builder__skeleton" /></main></AppShell>
  if (loadError || !quiz) return <AppShell><PageHeader eyebrow="QUESTION BUILDER" title="Quiz unavailable" subtitle="We couldn’t open these questions." /><main className="app-shell__content question-builder"><Alert tone="error" label="Questions unavailable">{loadError ?? 'This quiz could not be found.'}</Alert><Button to="/instructor/quizzes"><ArrowLeft size={17} aria-hidden="true" /> Back to all quizzes</Button></main></AppShell>

  return <AppShell>
    <PageHeader eyebrow={quiz.mode === 'quiz' ? 'QUESTION BUILDER · QUIZ' : 'QUESTION BUILDER · FLASHCARDS'} title="Shape the practice." subtitle="Each question and answer key is saved together as you work." action={<Button to={`/instructor/quizzes/${quizId}?tab=settings`} variant="secondary"><ArrowLeft size={17} aria-hidden="true" /> Settings</Button>} />
    <main className="app-shell__content question-builder" id="main-content">
      <nav aria-label="Quiz workspace" className="mb-4 flex flex-wrap gap-2"><Button to={`/instructor/quizzes/${quizId}?tab=questions`} aria-current="page" variant="secondary">Questions</Button><Button to={`/instructor/quizzes/${quizId}?tab=settings`} variant="secondary">Settings</Button><Button to={`/instructor/quizzes/${quizId}?tab=preview`} variant="secondary">Preview</Button><Button to={`/instructor/quizzes/${quizId}/results`} variant="ghost">Results</Button></nav>
      <SectionCard title="Publish checklist" description="Your quiz is ready when each item is complete.">
        <ul className="question-checklist">{checklistItems.map(({ complete, label }) => <li key={label}><span aria-hidden="true">{complete ? '✓' : '○'}</span><span>{label}</span></li>)}</ul>
        <Button type="button" disabled={!canPublish || publishBusy || saveStatus === 'saving'} onClick={() => void publish()}>{publishBusy ? 'Publishing…' : 'Publish quiz'}</Button>
      </SectionCard>
      {(() => {
        const listStatus = resolveListStatus({ loading: false, error: loadError, count: questions.length })
        if (listStatus === 'error') {
          return <Alert tone="error" label="Some questions could not be loaded">{loadError}</Alert>
        }
        if (listStatus === 'empty') {
          if (draft) {
            return (
              <div className="question-builder__first-editor">
                <SectionCard title="New question">
                  <QuestionForm draft={draft} mode={quiz.mode} errors={validateQuestionDraft(draft, quiz.mode)} onChange={(nextDraft) => { setDraft(nextDraft); setSaveStatus('waiting') }} />
                  <div className="question-builder__toolbar">
                    <span className="question-save-status" role="status">{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Complete valid fields to save'}</span>
                    {saveError && <Alert tone="error" label="Question not saved">{saveError}</Alert>}
                  </div>
                </SectionCard>
                <QuestionPreview draft={draft} explanationTiming={quiz.mode === 'quiz' ? quiz.settings.answerReveal : 'never'} />
              </div>
            )
          }
          return <EmptyState title="Start with a question" description={quiz.mode === 'quiz' ? 'Add a question and its answer key. Learners will see only the prompt and choices.' : quiz.mode === 'flashcards' ? 'Add a front and back for each card. Learners will self-rate their recall.' : 'Configure your canvas board.'} action={<QuestionTypeButtons mode={quiz.mode} onAdd={addQuestion} />} />
        }
        return (
          <section className="question-builder__layout" aria-label="Question workspace">
            <SectionCard title={`Questions · ${questions.length}`} description="Drag to reorder, or use the Move up and Move down controls.">
              <ol className="question-list">{questions.map((item, index) => <li key={item.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!dragId.current) return; const from = questions.findIndex((question) => question.id === dragId.current); const to = questions.findIndex((question) => question.id === item.id); const next = moveQuestion(questions, from, to); dragId.current = null; void reorderQuestions(quizId, next.map((question) => question.id)).catch((reason: unknown) => showToast('error', reason instanceof Error ? reason.message : 'Questions could not be reordered.')) }}>
                <div className="question-list__row"><span className="question-list__drag-handle" draggable aria-label={`Drag question ${index + 1} to reorder`} title="Drag to reorder" onDragStart={() => { dragId.current = item.id }}><GripVertical size={18} aria-hidden="true" /></span><button type="button" className="question-list__select" aria-pressed={questionId === item.id} onClick={() => selectQuestion(item)}><span><strong>{index + 1}. {item.question.prompt || 'Untitled question'}</strong><small>{item.question.type.replace('_', ' ')} · {item.question.points} {item.question.points === 1 ? 'point' : 'points'}</small></span></button><div className="question-list__actions"><Button type="button" variant="ghost" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => void move(item.id, -1)}><ArrowUp size={16} aria-hidden="true" /></Button><Button type="button" variant="ghost" aria-label={`Move question ${index + 1} down`} disabled={index === questions.length - 1} onClick={() => void move(item.id, 1)}><ArrowDown size={16} aria-hidden="true" /></Button></div></div>
              </li>)}</ol>
              <QuestionTypeButtons mode={quiz.mode} onAdd={addQuestion} />
            </SectionCard>
            <div className="question-builder__editor-column">
              {draft ? <SectionCard title={questionId ? 'Edit question' : 'New question'} description="Changes save automatically once the fields are valid."><QuestionForm draft={draft} mode={quiz.mode} errors={validateQuestionDraft(draft, quiz.mode)} onChange={(nextDraft) => { setDraft(nextDraft); setSaveStatus('waiting') }} /><div className="question-builder__toolbar"><span className={`question-save-status question-save-status--${saveStatus}`} role="status">{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Complete valid fields to save'}</span>{questionId && <><Button type="button" variant="secondary" onClick={() => { const selected = questions.find((question) => question.id === questionId); if (selected) duplicateQuestion(selected) }}><Copy size={16} aria-hidden="true" /> Duplicate</Button><Button type="button" variant="secondary" className="button--destructive" onClick={() => { const selected = questions.find((question) => question.id === questionId); if (selected) setDeleteTarget(selected) }}><Trash2 size={16} aria-hidden="true" /> Delete</Button></>}</div>{saveError && <Alert tone="error" label="Question not saved">{saveError}</Alert>}</SectionCard> : <EmptyState title="Choose a question" description="Select a question to edit, or add a new one to this quiz." action={<QuestionTypeButtons mode={quiz.mode} onAdd={addQuestion} />} />}
              {draft && <QuestionPreview draft={draft} explanationTiming={quiz.mode === 'quiz' ? quiz.settings.answerReveal : 'never'} />}
            </div>
          </section>
        )
      })()}
    </main>
    <ConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={() => void deleteSelectedQuestion()} title="Delete this question?" description={`Delete “${deleteTarget?.question.prompt ?? ''}” and its answer key? This cannot be undone.`} confirmLabel="Delete question" />
  </AppShell>
}

function QuestionTypeButtons({ mode, onAdd }: { mode: QuizMode; onAdd: (type: QuestionType) => void }) {
  if (mode === 'canvas') return null
  return <div className="question-type-buttons">{mode === 'flashcards' ? <Button type="button" onClick={() => onAdd('flashcard')}><Plus size={17} aria-hidden="true" /> Add flashcard</Button> : <>{(['multiple_choice', 'true_false', 'identification', 'fill_blank'] as const).map((type) => <Button type="button" variant="secondary" key={type} onClick={() => onAdd(type)}><Plus size={16} aria-hidden="true" /> Add {type === 'multiple_choice' ? 'multiple choice' : type === 'true_false' ? 'true/false' : type === 'identification' ? 'identification' : 'fill in the blank'}</Button>)}</>}</div>
}
