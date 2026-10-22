import { ArrowLeft, ArrowDown, ArrowUp, ClipboardPaste, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AppShell } from '../../../app/AppShell'
import { useAuth } from '../../auth/useAuth'
import { Alert } from '../../../shared/ui/Alert'
import { Button } from '../../../shared/ui/Button'
import { Dialog } from '../../../shared/ui/Dialog'
import { EmptyState } from '../../../shared/ui/EmptyState'
import { PageHeader } from '../../../shared/ui/PageHeader'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Textarea } from '../../../shared/ui/Textarea'
import { Skeleton } from '../../../shared/ui/Skeleton'
import { resolveListStatus } from '../../../shared/ui/listState'
import { useToast } from '../../../shared/ui/useToast'
import { useUnsavedChangesGuard } from '../../../shared/ui/useUnsavedChangesGuard'
import { deleteQuestion, getQuiz, reorderQuestions, saveQuestionAndKey, watchQuestionPairs, type SavedQuestion } from '../services'
import type { QuestionType, QuizMode } from '../types'
import { QuestionForm, QuestionPreview } from './QuestionForm'
import { createQuestionDraft, draftFromPair, moveQuestion, toQuestionPair, validateQuestionDraft, type QuestionDraft } from './questionDraft'
import { QuizWorkflowNav } from '../editor/QuizWorkflowNav'
import { hasTeamParticipation } from '../editor/quizExperience'
import { QuizTitleField } from '../editor/QuizTitleField'
import { parseQuestionsFromText } from '../authoring/textParser'

type SaveStatus = 'saved' | 'waiting' | 'saving' | 'error'

export function QuestionBuilderPage() {
  const { quizId = '' } = useParams()
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
  const [importOpen, setImportOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
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

  // Warn before leaving with a question that has content but is not saved yet. A blank new question is not worth a warning.
  const hasUnsavedQuestion = Boolean(draft && draft.prompt.trim() && (savedSignature !== JSON.stringify(draft) || saveStatus !== 'saved'))
  useUnsavedChangesGuard(hasUnsavedQuestion)

  function selectQuestion(question: SavedQuestion) {
    if (!question.answerKey) return
    const next = draftFromPair(question.question, question.answerKey)
    setQuestionId(question.id); setFormKey((key) => key + 1); setDraft(next); setSavedSignature(JSON.stringify(next)); setSaveStatus('saved'); setSaveError(null)
  }

  function addQuestion(type: QuestionType) {
    setQuestionId(null); setFormKey((key) => key + 1); setDraft(createQuestionDraft(type, questions.length)); setSavedSignature(null); setSaveStatus('waiting'); setSaveError(null)
  }

  function duplicateQuestion(question: SavedQuestion) {
    if (!question.answerKey) return
    const next = draftFromPair(question.question, question.answerKey)
    if (next.type === 'multiple_choice' || next.type === 'true_false') next.options = next.options.map((option, index) => ({ ...option, id: `copy-${Date.now()}-${index}` }))
    next.prompt = `${next.prompt} (copy)`
    setQuestionId(null); setFormKey((key) => key + 1); setDraft(next); setSavedSignature(null); setSaveStatus('waiting')
  }

  // Deleting is immediate and reversible: the toast offers Undo, which saves the question and its answer key back.
  async function removeQuestion(target: SavedQuestion) {
    const { question, answerKey } = target
    try {
      await deleteQuestion(quizId, target.id)
      if (questionId === target.id) { setQuestionId(null); setDraft(null); setSavedSignature(null) }
      showToast('success', 'Question deleted.', answerKey
        ? { label: 'Undo', onClick: () => { void saveQuestionAndKey(quizId, null, question, answerKey).catch((reason: unknown) => showToast('error', reason instanceof Error ? reason.message : 'Question could not be restored.')) } }
        : undefined)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Question could not be deleted.') }
  }

  const parsedImport = parseQuestionsFromText(importText)
  const importProblems = parsedImport.filter((item) => item.error).length

  async function importQuestions() {
    if (!quiz || parsedImport.length === 0 || importProblems > 0) return
    setImportBusy(true)
    try {
      for (const [index, item] of parsedImport.entries()) {
        const order = questions.length + index
        const draft: QuestionDraft = {
          ...createQuestionDraft(item.type, order),
          prompt: item.prompt,
          options: item.options.map((option, optionIndex) => ({ id: `option-${Date.now()}-${index}-${optionIndex}`, text: option.text, correct: option.correct })),
          acceptedAnswers: item.answer,
        }
        if (Object.keys(validateQuestionDraft(draft, quiz.mode)).length > 0) throw new Error(`Question ${index + 1} is not valid yet.`)
        const pair = toQuestionPair(draft, order)
        await saveQuestionAndKey(quizId, null, pair.question, pair.answerKey)
      }
      showToast('success', `${parsedImport.length} ${parsedImport.length === 1 ? 'question' : 'questions'} added.`)
      setImportOpen(false)
      setImportText('')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Questions could not be imported.') }
    finally { setImportBusy(false) }
  }

  async function move(id: string, offset: number) {
    const from = questions.findIndex((question) => question.id === id)
    const reordered = moveQuestion(questions, from, from + offset)
    if (reordered === questions) return
    try { await reorderQuestions(quizId, reordered.map((question) => question.id)) }
    catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Questions could not be reordered.') }
  }

  if (loading) return <AppShell><PageHeader eyebrow="QUESTION BUILDER" title="Loading quiz…" subtitle="" /><main className="app-shell__content question-builder"><Skeleton label="Loading quiz questions" className="question-builder__skeleton" /></main></AppShell>
  if (loadError || !quiz) return <AppShell><PageHeader eyebrow="QUESTION BUILDER" title="Quiz unavailable" subtitle="We couldn’t open these questions." /><main className="app-shell__content question-builder"><Alert tone="error" label="Questions unavailable">{loadError ?? 'This quiz could not be found.'}</Alert><Button to="/instructor/quizzes"><ArrowLeft size={17} aria-hidden="true" /> Back to all quizzes</Button></main></AppShell>

  return <AppShell>
    <PageHeader eyebrow={quiz.mode === 'quiz' ? 'STEP 1 OF 3 · QUESTIONS' : 'STEP 1 OF 3 · FLASHCARDS'} title={quiz.title || 'Untitled quiz'} subtitle="Add your questions and answer keys. Each one saves automatically once it is complete." />
    <main className="app-shell__content question-builder" id="main-content">
      <QuizTitleField quizId={quizId} title={quiz.title} onSaved={(title) => setQuiz({ ...quiz, title })} />
      <QuizWorkflowNav quizId={quizId} current="questions" hasTeams={hasTeamParticipation(quiz.mode, quiz.settings)} nextStep="settings" nextLabel="Next: Settings" />
      {quiz.mode === 'quiz' && <div className="mb-4"><Button type="button" variant="secondary" onClick={() => setImportOpen(true)}><ClipboardPaste size={16} aria-hidden="true" /> Paste questions</Button></div>}
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
                  <QuestionForm key={formKey} draft={draft} mode={quiz.mode} errors={validateQuestionDraft(draft, quiz.mode)} onChange={(nextDraft) => { setDraft(nextDraft); setSaveStatus('waiting') }} />
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
              {draft ? <SectionCard title={questionId ? 'Edit question' : 'New question'} description="Changes save automatically once the fields are valid."><QuestionForm key={formKey} draft={draft} mode={quiz.mode} errors={validateQuestionDraft(draft, quiz.mode)} onChange={(nextDraft) => { setDraft(nextDraft); setSaveStatus('waiting') }} /><div className="question-builder__toolbar"><span className={`question-save-status question-save-status--${saveStatus}`} role="status">{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Complete valid fields to save'}</span>{questionId && <><Button type="button" variant="secondary" onClick={() => { const selected = questions.find((question) => question.id === questionId); if (selected) duplicateQuestion(selected) }}><Copy size={16} aria-hidden="true" /> Duplicate</Button><Button type="button" variant="secondary" className="button--destructive" onClick={() => { const selected = questions.find((question) => question.id === questionId); if (selected) void removeQuestion(selected) }}><Trash2 size={16} aria-hidden="true" /> Delete</Button></>}</div>{saveError && <Alert tone="error" label="Question not saved">{saveError}</Alert>}</SectionCard> : <EmptyState title="Choose a question" description="Select a question to edit, or add a new one to this quiz." action={<QuestionTypeButtons mode={quiz.mode} onAdd={addQuestion} />} />}
              {draft && <QuestionPreview draft={draft} explanationTiming={quiz.mode === 'quiz' ? quiz.settings.answerReveal : 'never'} />}
            </div>
          </section>
        )
      })()}
    </main>
    <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Paste questions" description="Separate questions with a blank line. Mark the correct choice with *, or add an Answer: line for typed answers.">
      <div className="grid gap-4">
        <Textarea label="Questions" name="paste-questions" value={importText} onChange={(event) => setImportText(event.target.value)} rows={10} hint={'Example:  1. Capital of France?  a) Berlin  *b) Paris  c) Rome'} />
        {parsedImport.length > 0 && <p className="field__hint" role="status">{importProblems > 0 ? `${importProblems} of ${parsedImport.length} need fixing: ${parsedImport.find((item) => item.error)?.error}` : `${parsedImport.length} ${parsedImport.length === 1 ? 'question' : 'questions'} ready to add.`}</p>}
        <div className="dialog__actions">
          <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button type="button" disabled={importBusy || parsedImport.length === 0 || importProblems > 0} onClick={() => void importQuestions()}>{importBusy ? 'Adding…' : 'Add questions'}</Button>
        </div>
      </div>
    </Dialog>
  </AppShell>
}

function QuestionTypeButtons({ mode, onAdd, disabled }: { mode: QuizMode; onAdd: (type: QuestionType) => void; disabled?: boolean }) {
  return <div className="question-type-buttons">{mode === 'flashcards' ? <Button type="button" disabled={disabled} onClick={() => onAdd('flashcard')}><Plus size={17} aria-hidden="true" /> Add flashcard</Button> : <>{(['multiple_choice', 'true_false', 'identification', 'fill_blank'] as const).map((type) => <Button type="button" variant="secondary" key={type} disabled={disabled} onClick={() => onAdd(type)}><Plus size={16} aria-hidden="true" /> Add {type === 'multiple_choice' ? 'multiple choice' : type === 'true_false' ? 'true/false' : type === 'identification' ? 'identification' : 'fill in the blank'}</Button>)}</>}</div>
}
