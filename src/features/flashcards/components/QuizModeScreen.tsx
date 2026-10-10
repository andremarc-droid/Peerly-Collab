import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../../shared/ui/Button'
import { useAuth } from '../../auth/useAuth'
import { aiComplete } from '../../studyEngine/ai'
import { gradeChoice, gradeWrittenWithAi } from '../../studyEngine/grading'
import { buildQuiz, type QuizQuestion } from '../../studyEngine/quiz'
import { generateDistractors } from '../../studyEngine/quizAi'
import { answerQuestion, nextQuestion, quizSessionComplete, resolveSelfGrade, retryMissed, startQuizSession, type QuizSession } from '../../studyEngine/quizSession'
import { deckProgressKey } from '../../studyEngine/queue'
import { loadProgress, saveProgress } from '../../studyEngine/services'
import { localDayKey, recordGrade } from '../../studyEngine/progress'
import type { FlashcardDeckWithId } from '../types'

interface Props { deck: FlashcardDeckWithId }
export function QuizModeScreen({ deck }: Props) {
  const { user } = useAuth()
  const [session, setSession] = useState<QuizSession<QuizQuestion> | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [written, setWritten] = useState('')
  const [grading, setGrading] = useState(false)
  const [aiReason, setAiReason] = useState<string | null>(null)
  const cards = useMemo(() => deck.cards.map(({ id, front, back }) => ({ id, front, back })), [deck.cards])
  const key = deckProgressKey(deck.classId, deck.id)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const built = await buildQuiz(cards, ['multiple-choice', 'written'], true, generateDistractors, Math.min(50, cards.length))
        if (active) { setSession(startQuizSession(built.questions)); setNotice(built.notice) }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not prepare this quiz.')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [cards])

  const current = session?.questions[session.index]
  const submit = async (response: string | number) => {
    if (!session || !current || grading) return
    setGrading(true)
    try {
      const aiGrade = current.kind === 'written'
        ? await gradeWrittenWithAi(String(response), current.answer, (prompt, signal) => aiComplete(prompt, { signal }))
        : null
      setAiReason(aiGrade?.reason ?? null)
      const verdict = current.kind === 'multiple-choice' ? gradeChoice(current, Number(response)) : aiGrade!.verdict
      setSession(answerQuestion(session, response, verdict))
      setWritten('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check this answer.')
    } finally { setGrading(false) }
  }

  const markCard = async (verdict: 'correct' | 'incorrect') => {
    if (!session || !current || session.answer === null || !user) return
    try {
      const progress = await loadProgress(user.uid, key)
      const next = recordGrade(progress, current.cardId ?? current.id, verdict === 'correct' ? 'good' : 'again', Date.now(), localDayKey(new Date()))
      await saveProgress(user.uid, key, next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your answer.')
    }
  }

  if (loading) return <p role="status" className="m-0 text-base text-navy-900">Preparing your quiz…</p>
  if (error) return <p role="alert" className="m-0 text-base text-navy-900">{error}</p>
  if (!session || session.questions.length === 0) return <p className="m-0 text-base text-navy-900">Add at least one card to this deck to start a quiz.</p>
  if (quizSessionComplete(session)) return <section className="grid gap-3" aria-live="polite">
    <h3 className="m-0 text-lg font-bold text-navy-900">Quiz complete</h3>
    <p className="m-0 text-base text-navy-900">{session.correct} correct of {session.questions.length} · {session.missed.length} missed.</p>
    {session.missed.length > 0 && <Button variant="primary" onClick={() => setSession(retryMissed(session))}>Retry missed</Button>}
  </section>

  return <section className="grid gap-4" aria-label="Quiz">
    {notice && <p className="m-0 rounded-xl border border-navy-900-30 bg-white p-3 text-base text-navy-900" role="status">{notice}</p>}
    <p className="m-0 text-sm text-navy-900">Round {session.round} · Question {session.index + 1} of {session.questions.length}</p>
    <h3 className="m-0 text-lg font-bold text-navy-900">{current?.prompt}</h3>
    {current?.kind === 'multiple-choice' ? current.options?.map((option, index) => <Button key={`${current.id}-${option}`} variant="secondary" disabled={session.verdict !== null || grading} onClick={() => void submit(index)}>{option}</Button>) : <label className="grid gap-2 text-base text-navy-900">Your answer<textarea className="min-h-24 rounded-xl border border-navy-900-30 p-3 text-base focus:outline-none focus:ring-2 focus:ring-navy-800" value={written} onChange={event => setWritten(event.target.value)} disabled={session.verdict !== null || grading}/></label>}
    {current?.kind === 'written' && session.verdict === null && <Button variant="primary" disabled={grading || written.trim().length === 0} onClick={() => void submit(written)}>{grading ? 'Checking…' : 'Check answer'}</Button>}
    {session.verdict && <div className="grid gap-3 rounded-2xl border border-navy-900-15 bg-white p-4" aria-live="polite">
      <p className="m-0 text-base font-semibold text-navy-900">{session.verdict === 'unsure' ? 'Needs self-grading' : session.verdict === 'correct' ? 'Correct' : 'Not quite'} · {current?.explanation}</p>
      {session.verdict === 'unsure' ? <div className="grid gap-2"><p className="m-0 text-sm text-navy-900" role="status">AI grading {aiReason ?? 'unavailable'}; compare with the reference answer and self-grade.</p><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => setSession(resolveSelfGrade(session, 'correct'))}>My answer was correct</Button><Button variant="secondary" onClick={() => setSession(resolveSelfGrade(session, 'incorrect'))}>My answer was incorrect</Button></div></div> : <Button variant="primary" onClick={() => { void markCard(session.verdict === 'correct' ? 'correct' : 'incorrect').then(() => setSession(nextQuestion(session))) }}>Next question</Button>}
    </div>}
  </section>
}
