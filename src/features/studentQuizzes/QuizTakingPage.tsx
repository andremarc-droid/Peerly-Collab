import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { listMyEnrollments } from '../classes/services/joinService'
import { getQuiz } from '../quizzes/services/quizService'
import { getAttempt, autosaveAnswers, saveQuestionTimer, submitAttempt } from '../quizzes/services/attemptService'
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
import { estimateServerOffset, optionOrderForQuestion, persistedQuestionOrder, resumeQuestionClock, secondsUntil, type QuestionClock } from './quizLogic'
import { effectiveTimeLimitSeconds, formatClock, formatDuration } from '../quizzes/quizTiming'
import { QuestionTimer } from './QuestionTimer'
import { CanvasPlayPage } from './CanvasPlayPage'
import { BlankCanvasPlayPage } from './BlankCanvasPlayPage'
import type { CanvasQuestion } from '../canvas/types'
import type { BlankCanvasAnswer } from '../quizzes/types'

type QuestionRecord = QuizQuestion & { id: string }
const answerValue = (value: SubmittedAnswer | undefined, index?: number) => Array.isArray(value) ? (index === undefined ? '' : value[index] ?? '') : typeof value === 'object' && value !== null ? '' : value ?? ''
const hasAnswer = (value: SubmittedAnswer | undefined) => {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.some((item) => Boolean(item.trim()))
  if (typeof value === 'object') {
    const blank = value as { cards?: unknown[] }
    return Array.isArray(blank.cards) && blank.cards.length > 0
  }
  return Boolean(value.trim())
}

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

function readPersistedQuestionIndex(attemptId: string): number {
  if (!attemptId) return 0
  try {
    const raw = sessionStorage.getItem(`peerly:questionIndex:${attemptId}`)
    const n = Number(raw)
    return Number.isInteger(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function QuizTakingPage() {
  const { quizId = '', attemptId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof getQuiz>>>(null)
  const [attempt, setAttempt] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [questions, setQuestions] = useState<QuestionRecord[]>([])
  const [index, setIndex] = useState(() => readPersistedQuestionIndex(attemptId))
  const [answers, setAnswers] = useState<Record<string, SubmittedAnswer>>({})
  const checkedStorageKey = `peerly:checkedAnswers:${quizId}:${attemptId}`
  const [checked, setChecked] = useState<Record<string, { correct: boolean | null; explanation: string }>>(() => readCheckedAnswers(checkedStorageKey))
  // In a timed quiz `seconds` is what is left on the CURRENT question. It starts over for every question.
  const [seconds, setSeconds] = useState<number | null>(null)
  const [deadlineSeconds, setDeadlineSeconds] = useState<number | null>(null)
  const [clock, setClock] = useState<QuestionClock | null>(null)
  const [timeUp, setTimeUp] = useState<'question' | 'deadline' | null>(null)
  const [serverOffsetMs, setServerOffsetMs] = useState(0)
  const [offsetReady, setOffsetReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false)
  const [flashcardsFinished, setFlashcardsFinished] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [membership, setMembership] = useState<{ classId: string; status: 'active' | 'lost' } | null>(null)
  const autosaveTimer = useRef<number | null>(null)
  const lastSavedAnswers = useRef<string>('')
  const pendingAnswersRef = useRef<Record<string, SubmittedAnswer> | null>(null)
  const submitted = useRef(false)
  const autoSubmitTriggered = useRef(false)
  const clockRef = useRef<QuestionClock | null>(null)
  const timeUpReason = useRef<'question' | 'deadline'>('question')
  // The time limit applies to EACH question. A deadline, if there is one, ends the whole attempt.
  const limitSeconds = quiz ? effectiveTimeLimitSeconds(quiz.settings) : null
  const deadlineMs = quiz?.settings.closesAt?.toMillis() ?? null
  const timed = limitSeconds !== null

  /** Starts or resumes a question's countdown and remembers it, so a refresh can never hand out extra time. */
  const adoptClock = useCallback((next: QuestionClock, persist: boolean) => {
    clockRef.current = next
    setClock(next)
    setIndex(next.index)
    if (!persist) return
    try {
      void Promise.resolve(saveQuestionTimer(quizId, attemptId, next.index, next.startedAtMs)).catch(() => undefined)
    } catch {
      // The clock can always be rebuilt from the attempt's start time, so a failed save never interrupts the student.
    }
  }, [quizId, attemptId])

  useEffect(() => {
    let active = true
    // Timers wait for the server clock check, but never longer than a moment on a slow connection.
    const fallback = window.setTimeout(() => { if (active) setOffsetReady(true) }, 1500)
    void estimateServerOffset().then((offset) => {
      if (!active) return
      setServerOffsetMs(offset)
      setOffsetReady(true)
    })
    return () => { active = false; window.clearTimeout(fallback) }
  }, [])

  useEffect(() => {
    if (!attemptId) return
    try {
      sessionStorage.setItem(`peerly:questionIndex:${attemptId}`, String(index))
    } catch {
      // storage unavailable
    }
  }, [attemptId, index])

  useEffect(() => {
    if (!user) return undefined
    let live = true
    void Promise.all([getQuiz(quizId), getAttempt(quizId, attemptId), listQuestions(quizId)]).then(([foundQuiz, foundAttempt, rawQuestions]) => {
      if (!live) return
      if (!foundQuiz || !foundAttempt || foundAttempt.userId !== user.uid || foundAttempt.status !== 'in_progress') { setError('This attempt is unavailable.'); setLoading(false); return }
      if (foundQuiz.settings.participation.type === 'group') { navigate(`/student/quizzes/${foundQuiz.id}/team`, { replace: true }); return }
      const records = rawQuestions.map(({ id, ...value }) => ({ ...parseQuestion(value), id }))
      const ordered = persistedQuestionOrder(foundAttempt, records)
      setQuiz(foundQuiz); setAttempt({ ...foundAttempt, id: attemptId }); setAnswers(foundAttempt.answers)
      lastSavedAnswers.current = JSON.stringify(foundAttempt.answers)
      setQuestions(ordered)
      const restoredIndex = readPersistedQuestionIndex(attemptId)
      if (restoredIndex < ordered.length) {
        setIndex(restoredIndex)
      } else {
        setIndex(Math.max(0, ordered.length - 1))
      }
      setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'The attempt could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [quizId, attemptId, user, navigate])

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

  // Start the first countdown, or pick up the saved one after a refresh. Time spent away counts, so questions whose time ran out are skipped.
  useEffect(() => {
    if (!attempt || !quiz || limitSeconds === null || clockRef.current || !offsetReady || questions.length === 0) return
    const resumed = resumeQuestionClock(attempt.questionTimer, limitSeconds, questions.length, attempt.startedAt.toMillis(), Date.now() + serverOffsetMs)
    adoptClock({ index: resumed.index, startedAtMs: resumed.startedAtMs }, resumed.index !== (attempt.questionTimer?.index ?? 0))
  }, [attempt, quiz, limitSeconds, offsetReady, serverOffsetMs, questions.length, adoptClock])

  // One ticker drives the question countdown and the quiz deadline.
  useEffect(() => {
    if (!attempt || !quiz || (limitSeconds === null && deadlineMs === null) || !offsetReady) return undefined
    const attemptStartMs = attempt.startedAt.toMillis()
    const tick = () => {
      const now = Date.now() + serverOffsetMs
      if (deadlineMs !== null) {
        setDeadlineSeconds(secondsUntil(deadlineMs, now))
        if (now >= deadlineMs) { timeUpReason.current = 'deadline'; setTimeUp('deadline'); return }
      }
      const current = clockRef.current
      if (limitSeconds === null || !current) return
      const next = resumeQuestionClock(current, limitSeconds, questions.length, attemptStartMs, now)
      if (next.finished) {
        setSeconds(0)
        setTimeUp((existing) => existing ?? 'question')
        return
      }
      // The question's time ran out: move on, and the next question gets its full time.
      if (next.index !== current.index) adoptClock({ index: next.index, startedAtMs: next.startedAtMs }, true)
      setSeconds(secondsUntil(next.startedAtMs + limitSeconds * 1000, now))
    }
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [attempt, quiz, limitSeconds, deadlineMs, offsetReady, serverOffsetMs, questions.length, adoptClock])

  const flushPendingAnswers = useCallback(() => {
    if (pendingAnswersRef.current && JSON.stringify(pendingAnswersRef.current) !== lastSavedAnswers.current && !submitted.current) {
      const toSave = pendingAnswersRef.current
      lastSavedAnswers.current = JSON.stringify(toSave)
      pendingAnswersRef.current = null
      void autosaveAnswers(quizId, attemptId, toSave).catch((reason: unknown) => {
        showToast('error', reason instanceof Error ? reason.message : 'Answers could not be saved.')
      })
    }
  }, [quizId, attemptId, showToast])

  useEffect(() => {
    const onPageHide = () => flushPendingAnswers()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      flushPendingAnswers()
    }
  }, [flushPendingAnswers])

  useEffect(() => {
    if (!attempt || !Object.keys(answers).length) return undefined
    if (JSON.stringify(answers) === lastSavedAnswers.current) return undefined
    pendingAnswersRef.current = answers
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      flushPendingAnswers()
    }, 500)
    return () => { if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current) }
  }, [answers, attempt, flushPendingAnswers])

  const invalidLinkCards = useMemo(() => {
    const list: Array<{ questionId: string; questionIndex: number; cardId: string; title: string }> = []
    questions.forEach((q, qIdx) => {
      const ans = answers[q.id]
      if (ans && typeof ans === 'object' && 'cards' in ans && Array.isArray((ans as { cards?: unknown[] }).cards)) {
        const cards = (ans as { cards: Array<{ id?: string; type?: string; title?: string; url?: string }> }).cards
        cards.forEach((card) => {
          if (card.type === 'link') {
            const u = (card.url || '').trim()
            if (!u || !/^https:\/\/[^\s]+$/.test(u)) {
              list.push({
                questionId: q.id,
                questionIndex: qIdx,
                cardId: card.id || 'unknown',
                title: card.title || 'Untitled link',
              })
            }
          }
        })
      }
    })
    return list
  }, [questions, answers])
  // In a timed quiz earlier questions cannot be reopened, so only link cards that can still be edited block submitting.
  const blockingLinkCards = useMemo(() => (timed ? invalidLinkCards.filter((card) => card.questionIndex >= index) : invalidLinkCards), [timed, invalidLinkCards, index])

  const submit = useCallback(async (isAutoSubmit = false) => {
    if (submitted.current || !attempt || !quiz) return
    if (!isAutoSubmit && blockingLinkCards.length > 0) {
      showToast('error', 'Link cards must have a valid https:// URL before submitting.')
      return
    }
    submitted.current = true; setBusy(true); setError('')
    try {
      await autosaveAnswers(quizId, attemptId, answers)
      await submitAttempt(quizId, attemptId, Math.max(0, Math.floor((Date.now() + serverOffsetMs - attempt.startedAt.toMillis()) / 1000)))
      sessionStorage.removeItem(checkedStorageKey)
      sessionStorage.removeItem(`peerly:questionIndex:${attemptId}`)
      if (isAutoSubmit) {
        showToast('info', timeUpReason.current === 'deadline' ? 'The deadline passed, so your quiz was submitted.' : 'Time had run out, so your quiz was submitted.')
      }
      navigate(`/student/quizzes/${quizId}/attempts/${attemptId}/result`, { replace: true })
    } catch (reason) {
      submitted.current = false
      setError(reason instanceof Error ? reason.message : 'Submission failed.')
      showToast('error', 'Your quiz could not be submitted.')
      setBusy(false)
    }
  }, [attempt, quiz, quizId, attemptId, answers, navigate, showToast, checkedStorageKey, blockingLinkCards, serverOffsetMs])

  useEffect(() => {
    if (timeUp && !submitted.current && !autoSubmitTriggered.current) {
      autoSubmitTriggered.current = true
      void submit(true)
    }
  }, [timeUp, submit])

  const question = questions[index]
  const answeredCount = questions.filter((item) => hasAnswer(answers[item.id])).length
  const unanswered = questions.map((item, i) => ({ item, i })).filter(({ item }) => !hasAnswer(answers[item.id]))

  const setAnswer = (id: string, value: SubmittedAnswer) => setAnswers((current) => ({ ...current, [id]: value }))
  const go = (next: number) => {
    const target = Math.max(0, Math.min(questions.length - 1, next))
    if (!timed) { setIndex(target); return }
    // Every question has its own clock, so a timed quiz only moves forward. Moving on starts the next question's full time.
    if (target <= index) return
    adoptClock({ index: target, startedAtMs: Date.now() + serverOffsetMs }, true)
  }

  async function checkCurrent() {
    if (!question) return
    try {
      const pair = await getQuestionWithKey(quizId, question.id, undefined, quiz)
      if (!pair || !pair.answerKey) throw new Error('Answer key unavailable.')
      const result = gradeAttempt({
        userId: user!.uid,
        questions: [{ ...pair.question, id: question.id }],
        answerKeys: { [question.id]: pair.answerKey },
        answers: { [question.id]: (answers[question.id] as string | string[]) ?? '' },
      })
      const updated = { ...checked, [question.id]: { correct: result.perQuestion[question.id].correct, explanation: pair.answerKey.explanation } }
      sessionStorage.setItem(checkedStorageKey, JSON.stringify(updated))
      setChecked(updated)
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'Answer could not be checked.') }
  }

  const membershipStatus = quiz ? quiz.classId ? membership?.classId === quiz.classId ? membership.status : 'checking' : 'lost' : 'active'
  if (loading || membershipStatus === 'checking') return <AppShell><main className="app-shell__content"><Skeleton className="h-96 rounded-3xl" label="Loading attempt" /></main></AppShell>
  // A timed quiz shows nothing until its countdown is set, so a refresh never flashes a question that already ran out of time.
  if (timed && !clock && !error) return <AppShell><main className="app-shell__content"><Skeleton className="h-96 rounded-3xl" label="Starting the timer" /></main></AppShell>
  if (membershipStatus === 'lost') return <AppShell><main className="app-shell__content"><Alert tone="warning" label="Class access changed">You’re being returned to your practice catalog.</Alert></main></AppShell>
  if (error && (!quiz || !attempt)) return <AppShell><main className="app-shell__content grid gap-4"><Alert tone="error" label="Attempt unavailable">{error}</Alert><Button to="/student" variant="secondary">Back to catalog</Button></main></AppShell>
  if (!quiz || !attempt || !question) return <AppShell><main className="app-shell__content"><EmptyAttempt onBack={() => navigate('/student')} /></main></AppShell>
  const revealEach = quiz.settings.answerReveal === 'after_each'
  const checkedCurrent = revealEach ? checked[question.id] : undefined
  const options = 'options' in question ? optionOrderForQuestion(question.id, attempt, question).map((id) => question.options.find((option) => option.id === id)!).filter(Boolean) : []

  return <AppShell><PageHeader eyebrow={quiz.mode === 'flashcards' ? 'FLASHCARDS' : quiz.mode === 'canvas' ? 'CANVAS PRACTICE' : 'QUIZ IN PROGRESS'} title={quiz.title} subtitle={`Question ${index + 1} of ${questions.length}`} />
    <main className="app-shell__content grid gap-5" id="main-content">
      <label className="grid gap-2 text-sm font-semibold">Progress <progress aria-label="Quiz progress" max={questions.length} value={answeredCount} className="h-3 w-full accent-navy-900" /></label>
      {timed && limitSeconds !== null && index === 0 && <Alert tone="info" label="Timed quiz">Every question has {formatDuration(limitSeconds)}. When time runs out you move to the next question automatically, and you can’t go back.</Alert>}
      {deadlineSeconds !== null && deadlineSeconds > 0 && deadlineSeconds <= 600 && <Alert tone="warning" label="Deadline coming up">Your quiz is submitted automatically at the deadline ({formatClock(deadlineSeconds)} left).</Alert>}
      {timed && limitSeconds !== null && seconds !== null && <QuestionTimer remaining={seconds} limit={limitSeconds} />}
      {error && (
        <Alert
          tone="error"
          label="Submission problem"
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void submit(timeUp !== null)}>Retry submission</Button>
              <Button to="/student" variant="secondary">Back to catalog</Button>
            </div>
          }
        >
          {error}
        </Alert>
      )}
      <section
        className="quiz-taking__card grid gap-5 rounded-3xl bg-white p-5 sm:p-8"
        aria-labelledby="question-title"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement | null
          const isInput =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            Boolean(target?.isContentEditable)

          if (isInput && event.key !== 'Enter') return

          const isCanvas = quiz.mode === 'canvas' || question.type === 'canvas'
          const isInsideCanvasOrDialog = Boolean(
            target?.closest(
              '[data-testid="canvas-board"], .canvas-board-wrapper, .canvas-play-page, [role="dialog"], .dialog, .react-flow',
            ),
          )
          if (isCanvas && isInsideCanvasOrDialog) {
            if (
              event.key === 'Enter' ||
              event.key === 'ArrowLeft' ||
              event.key === 'ArrowRight' ||
              event.key === 'ArrowUp' ||
              event.key === 'ArrowDown' ||
              /^[0-9]$/.test(event.key)
            ) {
              return
            }
          }
          if (event.key === 'ArrowLeft' && index > 0) go(index - 1)
          const canGoNext = index < questions.length - 1 && (!revealEach || Boolean(checkedCurrent))
          if (event.key === 'ArrowRight' && canGoNext) go(index + 1)
          if (/^[1-6]$/.test(event.key) && options[Number(event.key) - 1] && !checkedCurrent) {
            setAnswer(question.id, options[Number(event.key) - 1].id)
          }
          if (
            event.key === 'Enter' &&
            !(event.target instanceof HTMLButtonElement) &&
            !(event.target instanceof HTMLTextAreaElement) &&
            quiz.mode !== 'flashcards'
          ) {
            event.preventDefault()
            if (revealEach && !checkedCurrent) void checkCurrent()
            else if (index < questions.length - 1) go(index + 1)
            else setReviewOpen(true)
          }
        }}
      >
        <p className="m-0 text-sm font-semibold">Question {index + 1} · {question.points} {question.points === 1 ? 'point' : 'points'}</p>
        <h2 id="question-title" className="m-0 font-heading text-2xl">
          {quiz.mode === 'canvas' ? (
            <span className="flex flex-col gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-navy-800-72">Instructions</span>
              <span>{question.prompt}</span>
            </span>
          ) : (
            question.prompt
          )}
        </h2>
        {quiz.mode === 'flashcards' ? (
          flashcardsFinished ? (
            <div className="grid gap-3">
              <p className="m-0">
                You rated {Object.values(answers).filter((answer) => answer === 'knew' || answer === 'learning').length} of {questions.length} cards: {Object.values(answers).filter((answer) => answer === 'knew').length} marked “Knew it” and {Object.values(answers).filter((answer) => answer === 'learning').length} still learning.
              </p>
              <Button type="button" onClick={() => void submit()}>Finish review</Button>
            </div>
          ) : (
            <Flashcard
              question={question}
              quizId={quizId}
              quiz={quiz}
              onRate={(rating) => {
                setAnswer(question.id, rating)
                if (index < questions.length - 1) go(index + 1)
                else setFlashcardsFinished(true)
              }}
            />
          )
        ) : quiz.mode === 'canvas' && quiz.boardKind === 'blank' ? (
          <BlankCanvasPlayPage
            question={question as unknown as CanvasQuestion & { id: string }}
            attemptId={attemptId}
            quizId={quizId}
            value={answers[question.id] as BlankCanvasAnswer | undefined}
            onChange={(nextVal) => setAnswer(question.id, nextVal)}
            disabled={Boolean(checkedCurrent)}
          />
        ) : quiz.mode === 'canvas' ? (
          <CanvasPlayPage
            question={question as unknown as CanvasQuestion & { id: string }}
            attemptId={attemptId}
            quizId={quizId}
            connections={Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : []}
            onChange={(nextConnections) => setAnswer(question.id, nextConnections)}
            disabled={Boolean(checkedCurrent)}
          />
        ) : (
          <AnswerInput
            question={question}
            options={options}
            value={answers[question.id]}
            disabled={Boolean(checkedCurrent)}
            onChange={(value) => setAnswer(question.id, value)}
          />
        )}
        {checkedCurrent && <Alert tone={checkedCurrent.correct ? 'success' : 'warning'} label={checkedCurrent.correct ? 'Correct' : 'Review this answer'}>{checkedCurrent.explanation || 'No explanation was provided.'}</Alert>}
      </section>
      {!timed && <nav className="flex flex-wrap gap-2" aria-label="Question navigator">{questions.map((item, i) => { const answered = hasAnswer(answers[item.id]); return <Button key={item.id} type="button" variant={i === index ? 'primary' : 'secondary'} aria-current={i === index ? 'step' : undefined} aria-label={`Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}`} onClick={() => go(i)}><span aria-hidden="true">{answered ? '✓' : '○'}</span> {i + 1} · {answered ? 'Answered' : 'Unanswered'}</Button> })}</nav>}
      <div className={`flex flex-wrap gap-3 ${timed ? 'justify-end' : 'justify-between'}`}>
        {!timed && <Button type="button" variant="secondary" disabled={index === 0} onClick={() => go(index - 1)}>Previous</Button>}
        <div className="flex flex-wrap gap-3">
          {revealEach && !checkedCurrent && quiz.mode !== 'flashcards' && quiz.mode !== 'canvas' ? (
            <Button type="button" onClick={() => void checkCurrent()}>Submit answer</Button>
          ) : index === questions.length - 1 ? (
            <Button type="button" onClick={() => setReviewOpen(true)}>Review and submit</Button>
          ) : (
            <Button type="button" onClick={() => go(index + 1)}>Next</Button>
          )}
        </div>
      </div>
    </main>
    <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review your answers" description={`${answeredCount} of ${questions.length} answered. ${unanswered.length} unanswered.`}>
      {blockingLinkCards.length > 0 && (
        <div className="mb-4">
          <Alert tone="error" label="Link cards must have a valid https:// URL before submitting.">
            <p className="m-0 text-sm text-navy-900">The following link cards are missing a valid web address:</p>
            <ul className="m-0 pl-5 text-sm list-disc">
              {blockingLinkCards.map((c) => (
                <li key={c.cardId}>
                  <button
                    type="button"
                    className="underline font-semibold hover:text-navy-900 text-left"
                    onClick={() => {
                      setReviewOpen(false)
                      go(c.questionIndex)
                    }}
                  >
                    Question {c.questionIndex + 1}: {c.title}
                  </button>
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      {unanswered.length > 0 ? timed ? <p>Unanswered: {unanswered.map(({ i }) => `Question ${i + 1}`).join(', ')}. Each question has its own time, so earlier questions can’t be reopened.</p> : <ol className="grid gap-2 pl-5">{unanswered.map(({ item, i }) => <li key={item.id}><Button type="button" variant="ghost" onClick={() => { setReviewOpen(false); go(i) }}>Question {i + 1}: {item.prompt}</Button></li>)}</ol> : <p>Every question has an answer.</p>}
      <div className="dialog__actions">
        <Button type="button" variant="secondary" onClick={() => setReviewOpen(false)}>Keep working</Button>
        <Button
          type="button"
          disabled={blockingLinkCards.length > 0}
          onClick={() => { setReviewOpen(false); setConfirmSubmitOpen(true) }}
        >
          Continue to submit
        </Button>
      </div>
    </Dialog>
    <ConfirmDialog open={confirmSubmitOpen} onClose={() => setConfirmSubmitOpen(false)} onConfirm={() => { setConfirmSubmitOpen(false); void submit() }} title="Submit your quiz?" description="Once submitted, your answers can’t be changed." confirmLabel="Submit quiz" busy={busy} closeOnConfirm={false} />
  </AppShell>
}

function AnswerInput({ question, options, value, disabled, onChange }: { question: QuestionRecord; options: Array<{ id: string; text: string }>; value: SubmittedAnswer | undefined; disabled: boolean; onChange: (value: SubmittedAnswer) => void }) {
  if (question.type === 'multiple_choice' || question.type === 'true_false') return <fieldset disabled={disabled} className="grid gap-3"><legend className="mb-2 font-semibold">Choose one answer</legend>{options.map((option, i) => <label key={option.id} className="quiz-taking__option flex min-h-12 cursor-pointer items-center gap-3 p-3 focus-within:ring-2"><input type="radio" name={`answer-${question.id}`} checked={value === option.id} onChange={() => onChange(option.id)} /><span><strong>{String.fromCharCode(65 + i)}.</strong> {option.text}</span>{value === option.id && <strong className="ml-auto">Selected</strong>}<span className="sr-only">Keyboard shortcut {i + 1}</span></label>)}</fieldset>
  if (question.type === 'identification') return <Input label="Your answer" value={answerValue(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  if (question.type === 'fill_blank') {
    const segments = question.prompt.split(/_{3,}|\[blank\]/gi)
    return <div className="flex flex-wrap items-baseline gap-2" aria-label="Fill in the blanks">{segments.map((segment, i) => <span key={`${i}-${segment}`} className="contents">{segment}{i < segments.length - 1 && <Input label={`Blank ${i + 1}`} className="max-w-48" value={answerValue(value, i)} disabled={disabled} onChange={(event) => { const next = Array.isArray(value) ? [...value] : []; next[i] = event.target.value; onChange(next) }} />}</span>)}</div>
  }
  return null
}

function Flashcard({ question, quizId, quiz, onRate }: { question: QuestionRecord; quizId: string; quiz: Awaited<ReturnType<typeof getQuiz>>; onRate: (rating: string) => void }) {
  const [back, setBack] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function flip() {
    setLoading(true)
    try {
      const pair = await getQuestionWithKey(quizId, question.id, undefined, quiz)
      if (!pair || !pair.answerKey || pair.answerKey.type !== 'flashcard') throw new Error('Card unavailable')
      setBack(pair.answerKey.back)
    } finally {
      setLoading(false)
    }
  }
  return <div className="grid gap-4"><Button type="button" variant="secondary" onClick={() => void flip()} disabled={loading}>{back ? 'Card back' : 'Flip card'}</Button>{back && <div className="rounded-2xl border border-navy-900-20 p-5"><p className="m-0">{back}</p><div className="mt-4 flex flex-wrap gap-3"><Button type="button" onClick={() => onRate('knew')}>Knew it</Button><Button type="button" variant="secondary" onClick={() => onRate('learning')}>Still learning</Button></div></div>}</div>
}

function EmptyAttempt({ onBack }: { onBack: () => void }) { return <Alert tone="warning" label="No questions found"><Button type="button" onClick={onBack}>Back to catalog</Button></Alert> }
