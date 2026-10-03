import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { listMyEnrollments } from '../classes/services/joinService'
import { getQuiz } from '../quizzes/services/quizService'
import { getAttempt, autosaveAnswers, submitAttempt } from '../quizzes/services/attemptService'
import { getQuestionWithKey, listQuestions } from '../quizzes/services/questionService'
import type { QuizAttempt, QuizQuestion, SubmittedAnswer } from '../quizzes/types'
import { parseQuestion } from '../quizzes/schemas'
import { gradeAttempt } from '../quizzes/grading/grade'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { PageHeader } from '../../shared/ui/PageHeader'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { optionOrderForQuestion, persistedQuestionOrder, remainingSeconds, shouldAutoSubmit } from './quizLogic'

type QuestionRecord = QuizQuestion & { id: string }
const answerValue = (value: SubmittedAnswer | undefined, index?: number) => Array.isArray(value) ? (index === undefined ? '' : value[index] ?? '') : value ?? ''
const hasAnswer = (value: SubmittedAnswer | undefined) => Array.isArray(value) ? value.some((item) => Boolean(item.trim())) : Boolean(value?.trim())

function readCheckedAnswers(storageKey: string) {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, { correct: boolean | null; explanation: string }] => {
      const value = entry[1]
      return typeof value === 'object' && value !== null && 'correct' in value && (value.correct === null || typeof value.correct === 'boolean') && 'explanation' in value && typeof value.explanation === 'string'
    }))
  } catch { return {} }
}

export function QuizTakingPage() {
  const { quizId = '', attemptId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof getQuiz>>>(null)
  const [attempt, setAttempt] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [questions, setQuestions] = useState<QuestionRecord[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, SubmittedAnswer>>({})
  const checkedStorageKey = `peerly:checkedAnswers:${quizId}:${attemptId}`
  const [checked, setChecked] = useState<Record<string, { correct: boolean | null; explanation: string }>>(() => readCheckedAnswers(checkedStorageKey))
  const [seconds, setSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [flashcardsFinished, setFlashcardsFinished] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<{ classId: string; status: 'active' | 'lost' } | null>(null)
  const autosaveTimer = useRef<number | null>(null)
  const submitted = useRef(false)

  useEffect(() => {
    if (!user) return undefined
    let live = true
    void Promise.all([getQuiz(quizId), getAttempt(quizId, attemptId), listQuestions(quizId)]).then(([foundQuiz, foundAttempt, rawQuestions]) => {
      if (!live) return
      if (!foundQuiz || !foundAttempt || foundAttempt.userId !== user.uid || foundAttempt.status !== 'in_progress') { setError('This attempt is unavailable.'); setLoading(false); return }
      if (foundQuiz.settings.participation.type === 'group') { setError('Group quizzes are coming soon.'); setLoading(false); return }
      const records = rawQuestions.map(({ id, ...value }) => ({ ...parseQuestion(value), id }))
      setQuiz(foundQuiz); setAttempt({ ...foundAttempt, id: attemptId }); setAnswers(foundAttempt.answers)
      setQuestions(persistedQuestionOrder(foundAttempt, records)); setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'The attempt could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [quizId, attemptId, user])

  useEffect(() => {
    if (!user || !quiz) return undefined
    if (!quiz.classId) {
      showToast('info', 'This quiz is no longer linked to an active class.')
      navigate('/student', { replace: true })
      return undefined
    }
    return listMyEnrollments(user.uid, (items) => {
      const isActive = items.some((item) => item.classId === quiz.classId && item.status === 'active')
      setMembership({ classId: quiz.classId!, status: isActive ? 'active' : 'lost' })
      if (!isActive) {
        showToast('info', 'Your class access changed. This attempt was not submitted.')
        navigate('/student', { replace: true })
      }
    }, () => {
      showToast('error', 'Your class access could not be checked. Please return to practice and try again.')
      navigate('/student', { replace: true })
    })
  }, [quiz, user, showToast, navigate])

  useEffect(() => {
    if (!attempt || !quiz?.settings.timeLimitMinutes) return undefined
    const started = attempt.startedAt.toMillis()
    const update = () => setSeconds(remainingSeconds(started, quiz.settings.timeLimitMinutes!, Date.now()))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [attempt, quiz])

  useEffect(() => {
    if (!attempt || !Object.keys(answers).length) return undefined
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      void autosaveAnswers(quizId, attemptId, answers).catch((reason: unknown) => showToast('error', reason instanceof Error ? reason.message : 'Answers could not be saved.'))
    }, 500)
    return () => { if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current) }
  }, [answers, attempt, quizId, attemptId, showToast])

  const submit = useCallback(async () => {
    if (submitted.current || !attempt || !quiz) return
    submitted.current = true; setBusy(true); setError('')
    try {
      await autosaveAnswers(quizId, attemptId, answers)
      await submitAttempt(quizId, attemptId, quiz.settings.timeLimitMinutes ? Math.max(0, quiz.settings.timeLimitMinutes * 60 - (seconds ?? 0)) : Math.floor((Date.now() - attempt.startedAt.toMillis()) / 1000))
      sessionStorage.removeItem(checkedStorageKey)
      navigate(`/student/quizzes/${quizId}/attempts/${attemptId}/result`, { replace: true })
    } catch (reason) { submitted.current = false; setError(reason instanceof Error ? reason.message : 'Submission failed.'); showToast('error', 'Your quiz could not be submitted.'); setBusy(false) }
  }, [attempt, quiz, quizId, attemptId, answers, seconds, navigate, showToast, checkedStorageKey])

  useEffect(() => { if (seconds !== null && shouldAutoSubmit(seconds) && !submitted.current) void submit() }, [seconds, submit])

  const question = questions[index]
  const answeredCount = questions.filter((item) => hasAnswer(answers[item.id])).length
  const unanswered = questions.map((item, i) => ({ item, i })).filter(({ item }) => !hasAnswer(answers[item.id]))
  const setAnswer = (id: string, value: SubmittedAnswer) => setAnswers((current) => ({ ...current, [id]: value }))
  const go = (next: number) => setIndex(Math.max(0, Math.min(questions.length - 1, next)))

  async function checkCurrent() {
    if (!question) return
    try {
      const pair = await getQuestionWithKey(quizId, question.id)
      if (!pair) throw new Error('Answer key unavailable.')
      const result = gradeAttempt({ userId: user!.uid, questions: [{ ...pair.question, id: question.id }], answerKeys: { [question.id]: pair.answerKey }, answers: { [question.id]: answers[question.id] ?? '' } })
      const updated = { ...checked, [question.id]: { correct: result.perQuestion[question.id].correct, explanation: pair.answerKey.explanation } }
      sessionStorage.setItem(checkedStorageKey, JSON.stringify(updated))
      setChecked(updated)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Answer could not be checked.') }
  }

  const membershipStatus = quiz ? quiz.classId ? membership?.classId === quiz.classId ? membership.status : 'checking' : 'lost' : 'active'
  if (loading || membershipStatus === 'checking') return <AppShell><main className="app-shell__content"><Skeleton className="h-96 rounded-3xl" label="Loading attempt" /></main></AppShell>
  if (membershipStatus === 'lost') return <AppShell><main className="app-shell__content"><Alert tone="warning" label="Class access changed">You’re being returned to your practice catalog.</Alert></main></AppShell>
  if (error && (!quiz || !attempt)) return <AppShell><main className="app-shell__content grid gap-4"><Alert tone="error" label="Attempt unavailable">{error}</Alert><Button to="/student" variant="secondary">Back to practice</Button></main></AppShell>
  if (!quiz || !attempt || !question) return <AppShell><main className="app-shell__content"><EmptyAttempt onBack={() => navigate('/student')} /></main></AppShell>
  const revealEach = quiz.settings.answerReveal === 'after_each'
  const checkedCurrent = revealEach ? checked[question.id] : undefined
  const options = 'options' in question ? optionOrderForQuestion(question.id, attempt, question).map((id) => question.options.find((option) => option.id === id)!).filter(Boolean) : []
  const timeText = seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return <AppShell><PageHeader eyebrow={quiz.mode === 'flashcards' ? 'FLASHCARDS' : 'QUIZ IN PROGRESS'} title={quiz.title} subtitle={`${index + 1} of ${questions.length}${timeText ? ` · ${timeText} remaining` : ''}`} />
    <main className="app-shell__content grid gap-5" id="main-content">
      <label className="grid gap-2 text-sm font-semibold">Progress <progress aria-label="Quiz progress" max={questions.length} value={answeredCount} className="h-3 w-full accent-navy-900" /></label>
      {seconds !== null && seconds <= 60 && seconds > 0 && <Alert tone="warning" label="One minute remaining">Your quiz will submit automatically when time runs out.</Alert>}
      {error && <Alert tone="error" label="Submission problem">{error}</Alert>}
      <section className="grid gap-5 rounded-3xl bg-white p-5 shadow-navy sm:p-8" aria-labelledby="question-title" onKeyDown={(event) => { if (event.key === 'ArrowLeft') go(index - 1); if (event.key === 'ArrowRight' && !checkedCurrent) go(index + 1); if (/^[1-6]$/.test(event.key) && options[Number(event.key) - 1] && !checkedCurrent) setAnswer(question.id, options[Number(event.key) - 1].id); if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement) && quiz.mode !== 'flashcards') { event.preventDefault(); if (revealEach && !checkedCurrent) void checkCurrent(); else if (index < questions.length - 1) go(index + 1); else setReviewOpen(true) } }}>
        <p className="m-0 text-sm font-semibold">Question {index + 1} · {question.points} {question.points === 1 ? 'point' : 'points'}</p>
        <h2 id="question-title" className="m-0 font-heading text-2xl">{question.prompt}</h2>
        {quiz.mode === 'flashcards' ? flashcardsFinished ? <div className="grid gap-3"><p className="m-0">You rated {Object.values(answers).filter((answer) => answer === 'knew' || answer === 'learning').length} of {questions.length} cards: {Object.values(answers).filter((answer) => answer === 'knew').length} marked “Knew it” and {Object.values(answers).filter((answer) => answer === 'learning').length} still learning.</p><Button type="button" onClick={() => void submit()}>Finish review</Button></div> : <Flashcard question={question} quizId={quizId} onRate={(rating) => { setAnswer(question.id, rating); if (index < questions.length - 1) go(index + 1); else setFlashcardsFinished(true) }} /> : <AnswerInput question={question} options={options} value={answers[question.id]} disabled={Boolean(checkedCurrent)} onChange={(value) => setAnswer(question.id, value)} />}
        {checkedCurrent && <Alert tone={checkedCurrent.correct ? 'success' : 'warning'} label={checkedCurrent.correct ? 'Correct' : 'Review this answer'}>{checkedCurrent.explanation || 'No explanation was provided.'}</Alert>}
        <div className="flex flex-wrap gap-3">{revealEach && !checkedCurrent && quiz.mode !== 'flashcards' && <Button type="button" variant="secondary" onClick={() => void checkCurrent()}>Check answer</Button>}{checkedCurrent && <Button type="button" onClick={() => go(index + 1)}>Next</Button>}</div>
      </section>
      <nav className="flex flex-wrap gap-2" aria-label="Question navigator">{questions.map((item, i) => { const answered = hasAnswer(answers[item.id]); return <Button key={item.id} type="button" variant={i === index ? 'primary' : 'secondary'} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}`} onClick={() => go(i)}><span aria-hidden="true">{answered ? '✓' : '○'}</span> {i + 1} · {answered ? 'Answered' : 'Unanswered'}</Button> })}</nav>
      <div className="flex flex-wrap justify-between gap-3"><Button type="button" variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>Previous</Button><Button type="button" variant="secondary" disabled={index === questions.length - 1 || revealEach && !checkedCurrent} onClick={() => go(index + 1)}>Next</Button><Button type="button" onClick={() => setReviewOpen(true)}>Review and submit</Button></div>
    </main>
    <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review your answers" description={`${answeredCount} of ${questions.length} answered. ${unanswered.length} unanswered.`}>
      {unanswered.length > 0 ? <ol className="grid gap-2 pl-5">{unanswered.map(({ item, i }) => <li key={item.id}><Button type="button" variant="ghost" onClick={() => { setReviewOpen(false); go(i) }}>Question {i + 1}: {item.prompt}</Button></li>)}</ol> : <p>Every question has an answer.</p>}
      <div className="dialog__actions"><Button type="button" variant="secondary" onClick={() => setReviewOpen(false)}>Keep working</Button><Button type="button" onClick={() => { setReviewOpen(false); setConfirmSubmitOpen(true) }}>Continue to submit</Button></div>
    </Dialog>
    <ConfirmDialog open={confirmSubmitOpen} onClose={() => setConfirmSubmitOpen(false)} onConfirm={() => { setConfirmSubmitOpen(false); void submit() }} title="Submit your quiz?" description="Once submitted, your answers can’t be changed." confirmLabel="Submit quiz" busy={busy} closeOnConfirm={false} />
  </AppShell>
}

function AnswerInput({ question, options, value, disabled, onChange }: { question: QuestionRecord; options: Array<{ id: string; text: string }>; value: SubmittedAnswer | undefined; disabled: boolean; onChange: (value: SubmittedAnswer) => void }) {
  if (question.type === 'multiple_choice' || question.type === 'true_false') return <fieldset disabled={disabled} className="grid gap-3"><legend className="mb-2 font-semibold">Choose one answer</legend>{options.map((option, i) => <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-navy-900-20 p-3 focus-within:ring-2"><input type="radio" name={`answer-${question.id}`} checked={value === option.id} onChange={() => onChange(option.id)} />{String.fromCharCode(65 + i)}. {option.text}</label>)}</fieldset>
  if (question.type === 'identification') return <Input label="Your answer" value={answerValue(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  if (question.type === 'fill_blank') {
    const segments = question.prompt.split(/_{3,}|\[blank\]/gi)
    return <div className="flex flex-wrap items-baseline gap-2" aria-label="Fill in the blanks">{segments.map((segment, i) => <span key={`${i}-${segment}`} className="contents">{segment}{i < segments.length - 1 && <Input label={`Blank ${i + 1}`} className="max-w-48" value={answerValue(value, i)} disabled={disabled} onChange={(event) => { const next = Array.isArray(value) ? [...value] : []; next[i] = event.target.value; onChange(next) }} />}</span>)}</div>
  }
  return null
}

function Flashcard({ question, quizId, onRate }: { question: QuestionRecord; quizId: string; onRate: (rating: string) => void }) {
  const [back, setBack] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function flip() { setLoading(true); try { const pair = await getQuestionWithKey(quizId, question.id); if (!pair || pair.answerKey.type !== 'flashcard') throw new Error('Card unavailable'); setBack(pair.answerKey.back) } finally { setLoading(false) } }
  return <div className="grid gap-4"><Button type="button" variant="secondary" onClick={() => void flip()} disabled={loading}>{back ? 'Card back' : 'Flip card'}</Button>{back && <div className="rounded-2xl border border-navy-900-20 p-5"><p className="m-0">{back}</p><div className="mt-4 flex flex-wrap gap-3"><Button type="button" onClick={() => onRate('knew')}>Knew it</Button><Button type="button" variant="secondary" onClick={() => onRate('learning')}>Still learning</Button></div></div>}</div>
}

function EmptyAttempt({ onBack }: { onBack: () => void }) { return <Alert tone="warning" label="No questions found"><Button type="button" onClick={onBack}>Return to practice</Button></Alert> }
