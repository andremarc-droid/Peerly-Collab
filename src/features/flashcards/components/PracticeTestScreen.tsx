import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { useAuth } from '../../auth/useAuth'
import { aiComplete } from '../../studyEngine/ai'
import { gradeChoice, gradeWrittenWithAi, type AnswerVerdict } from '../../studyEngine/grading'
import { buildQuiz, type QuizKind, type QuizQuestion } from '../../studyEngine/quiz'
import { generateDistractors } from '../../studyEngine/quizAi'
import { isTimeUp, remainingSeconds, scoreTest, type TestAttempt } from '../../studyEngine/practiceTest'
import { deckProgressKey, type StudyCard } from '../../studyEngine/queue'
import { listAttempts, saveAttempt } from '../../studyEngine/services'
import type { FlashcardDeckWithId } from '../types'

interface Props { deck: FlashcardDeckWithId }
interface HistoryItem { id: string; attempt: TestAttempt }
type Screen = 'setup' | 'running' | 'review'
const timeChoices = [null, 300, 600, 900, 1800] as const

export function PracticeTestScreen({ deck }: Props) {
  const { user } = useAuth()
  const [screen, setScreen] = useState<Screen>('setup')
  const [count, setCount] = useState(Math.min(10, deck.cards.length))
  const [kinds, setKinds] = useState<QuizKind[]>(['multiple-choice', 'written'])
  const [timeLimit, setTimeLimit] = useState<number | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [responses, setResponses] = useState<(string | number | null)[]>([])
  const [index, setIndex] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [attempt, setAttempt] = useState<TestAttempt | null>(null)
  const [attemptId, setAttemptId] = useState<string | undefined>()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submitted = useRef(false)
  const submitRef = useRef<() => void>(() => undefined)
  const cards: StudyCard[] = useMemo(() => deck.cards.map(({ id, front, back }) => ({ id, front, back })), [deck.cards])
  const deckKey = deckProgressKey(deck.classId, deck.id)
  const current = questions[index]

  useEffect(() => {
    if (!user) { setHistoryLoading(false); return }
    let active = true
    void listAttempts(user.uid, deckKey)
      .then(items => { if (active) setHistory(items.map((item, itemIndex) => ({ id: `${item.createdAt}-${itemIndex}`, attempt: item }))) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load test history.') })
      .finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [deckKey, user])

  const submitTest = useCallback(async () => {
    if (!user || submitted.current || questions.length === 0 || startedAt === null) return
    submitted.current = true
    setBusy(true)
    setScreen('review')
    try {
      const verdicts: (AnswerVerdict | null)[] = []
      for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
        const question = questions[questionIndex]!
        const response = responses[questionIndex] ?? null
        if (response === null || response === '') { verdicts.push('incorrect' as const); continue }
        if (question.kind === 'multiple-choice') verdicts.push(gradeChoice(question, Number(response)))
        else {
          const result = await gradeWrittenWithAi(String(response), question.answer, (prompt, signal) => aiComplete(prompt, { signal }))
          verdicts.push(result.selfGrade ? 'unsure' as const : result.verdict)
          if (result.selfGrade) setNotice(`AI grading ${result.reason ?? 'unavailable'}; use the reference answer to self-grade below.`)
        }
      }
      const finishedAt = Date.now()
      const result = scoreTest(questions, responses, verdicts, deckKey, finishedAt, startedAt, timeLimit)
      setAttempt(result)
      const id = await saveAttempt(user.uid, result)
      setAttemptId(id)
      const recent = await listAttempts(user.uid, deckKey)
      setHistory(recent.map((item, itemIndex) => ({ id: `${item.createdAt}-${itemIndex}`, attempt: item })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your practice test.')
    } finally { setBusy(false) }
  }, [deckKey, questions, responses, startedAt, timeLimit, user])
  submitRef.current = () => { void submitTest() }

  useEffect(() => {
    if (screen !== 'running' || startedAt === null || timeLimit === null) return undefined
    const update = () => {
      const seconds = remainingSeconds(startedAt, timeLimit, Date.now()) ?? 0
      setRemaining(seconds)
      if (isTimeUp(startedAt, timeLimit, Date.now())) submitRef.current()
    }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [screen, startedAt, timeLimit])

  const startTest = async () => {
    if (!kinds.length) { setError('Choose at least one question type.'); return }
    if (!cards.length) { setError('Add flashcards before starting a test.'); return }
    setBusy(true); setError(null); setNotice(null); submitted.current = false
    try {
      const built = await buildQuiz(cards, kinds, true, generateDistractors, count)
      if (!built.questions.length) throw new Error('No questions could be created for this test.')
      const start = Date.now()
      setQuestions(built.questions); setResponses(Array(built.questions.length).fill(null)); setIndex(0)
      setStartedAt(start); setRemaining(timeLimit); setAttempt(null); setAttemptId(undefined); setNotice(built.notice)
      setScreen('running')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the test.') }
    finally { setBusy(false) }
  }

  const setAnswer = (value: string | number) => setResponses(previous => {
    const next = [...previous]; next[index] = value; return next
  })

  const goNext = () => {
    if (index >= questions.length - 1) { void submitTest(); return }
    setIndex(value => value + 1)
  }

  const resolveReview = async (questionIndex: number, correct: boolean) => {
    if (!user || !attempt) return
    const review = attempt.review.map((item, itemIndex) => itemIndex === questionIndex ? { ...item, correct } : item)
    const next = { ...attempt, review, score: review.filter(item => item.correct === true).length }
    setAttempt(next)
    try {
      const savedId = await saveAttempt(user.uid, next, attemptId)
      setAttemptId(savedId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your self-grade.') }
  }

  return <section className="grid gap-4" aria-label="Practice test">
    {error && <p role="alert" className="m-0 rounded-xl border border-navy-900-30 bg-white p-3 text-base text-navy-900">{error}</p>}
    {notice && <p role="status" className="m-0 rounded-xl border border-navy-900-30 bg-white p-3 text-base text-navy-900">{notice}</p>}
    {screen === 'setup' && <div className="grid gap-4">
      <h3 className="m-0 text-lg font-bold text-navy-900">Set up a practice test</h3>
      <label className="grid gap-2 text-base text-navy-900">Question count<select className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-navy-800" value={count} onChange={event => setCount(Number(event.target.value))}>{Array.from({ length: Math.min(50, cards.length) }, (_, i) => i + 1).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <fieldset className="grid gap-2"><legend className="text-base font-semibold text-navy-900">Question types</legend>{(['multiple-choice', 'written'] as const).map(kind => <label key={kind} className="flex min-h-11 items-center gap-3 text-base text-navy-900"><input type="checkbox" checked={kinds.includes(kind)} onChange={event => setKinds(previous => event.target.checked ? [...previous, kind] : previous.filter(item => item !== kind))}/>{kind === 'multiple-choice' ? 'Multiple choice' : 'Written answer'}</label>)}</fieldset>
      <label className="grid gap-2 text-base text-navy-900">Time limit<select className="min-h-11 rounded-xl border border-navy-900-30 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-navy-800" value={timeLimit ?? 'untimed'} onChange={event => setTimeLimit(event.target.value === 'untimed' ? null : Number(event.target.value))}>{timeChoices.map(value => <option key={value ?? 'untimed'} value={value ?? 'untimed'}>{value === null ? 'Untimed' : `${value / 60} minutes`}</option>)}</select></label>
      <Button variant="primary" disabled={busy || cards.length === 0} onClick={() => void startTest()}>{busy ? 'Preparing…' : 'Start practice test'}</Button>
    </div>}
    {screen === 'running' && current && <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="m-0 text-sm text-navy-900">Question {index + 1} of {questions.length} · No feedback until submission</p>{remaining !== null && <p className="m-0 rounded-xl border border-navy-900-30 px-3 py-2 text-base font-semibold text-navy-900" role="timer" aria-live="off">Time left: {Math.floor(remaining / 60)}:{`${remaining % 60}`.padStart(2, '0')}</p>}</div>
      <h3 className="m-0 text-lg font-bold text-navy-900">{current.prompt}</h3>
      {current.kind === 'multiple-choice' ? current.options?.map((option, optionIndex) => <Button key={`${current.id}-${option}`} variant="secondary" aria-pressed={responses[index] === optionIndex} onClick={() => setAnswer(optionIndex)}>{option}</Button>) : <label className="grid gap-2 text-base text-navy-900">Your answer<textarea className="min-h-24 rounded-xl border border-navy-900-30 p-3 text-base focus:outline-none focus:ring-2 focus:ring-navy-800" value={typeof responses[index] === 'string' ? responses[index] as string : ''} onChange={event => setAnswer(event.target.value)}/></label>}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={index === 0} onClick={() => setIndex(value => value - 1)}>Previous</Button><Button variant="primary" onClick={goNext}>{index === questions.length - 1 ? 'Submit test' : 'Next'}</Button></div>
    </div>}
    {screen === 'review' && <div className="grid gap-4">
      {busy && <p role="status" className="m-0 text-base text-navy-900">Scoring and saving your attempt…</p>}
      {attempt && <><h3 className="m-0 text-lg font-bold text-navy-900">Score: {attempt.score} of {attempt.maxScore}</h3><p className="m-0 text-base text-navy-900">Time taken: {attempt.durationSeconds} seconds</p>{attempt.review.map((item, itemIndex) => <article key={item.question.id} className="grid gap-2 rounded-2xl border border-navy-900-15 bg-white p-4"><h4 className="m-0 text-base font-semibold text-navy-900">{itemIndex + 1}. {item.question.prompt}</h4><p className="m-0 text-base text-navy-900">Your answer: {item.response === null ? 'No answer' : typeof item.response === 'number' ? item.question.options?.[item.response] ?? 'No answer' : item.response}</p><p className="m-0 text-base text-navy-900">Reference: {item.question.answer}</p>{item.correct === null && <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => void resolveReview(itemIndex, true)}>My answer was correct</Button><Button variant="secondary" onClick={() => void resolveReview(itemIndex, false)}>My answer was incorrect</Button></div>}<p className="m-0 text-sm text-navy-900">{item.correct === null ? 'Needs self-grading' : item.correct ? 'Correct' : 'Incorrect'}</p></article>)}</>}
    </div>}
    <section className="grid gap-3 border-t border-navy-900-15 pt-4" aria-labelledby="test-history-heading">
      <h3 id="test-history-heading" className="m-0 text-lg font-bold text-navy-900">Attempt history</h3>
      {historyLoading ? <p role="status" className="m-0 text-base text-navy-900">Loading history…</p> : history.length === 0 ? <p className="m-0 text-base text-navy-900">No practice tests yet.</p> : <ul className="m-0 grid list-none gap-2 p-0">{history.map(item => <li key={item.id} className="rounded-xl border border-navy-900-15 p-3 text-base text-navy-900"><time dateTime={new Date(item.attempt.createdAt).toISOString()}>{new Date(item.attempt.createdAt).toLocaleString()}</time> · {item.attempt.score}/{item.attempt.maxScore} · {item.attempt.durationSeconds}s</li>)}</ul>}
    </section>
  </section>
}
