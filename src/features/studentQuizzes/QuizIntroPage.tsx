import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { getQuiz, type QuizRecord } from '../quizzes/services/quizService'
import { listQuestions } from '../quizzes/services/questionService'
import { listUserAttempts, startAttempt } from '../quizzes/services/attemptService'
import type { QuizAttempt } from '../quizzes/types'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { remainingAttempts } from './quizLogic'

export function QuizIntroPage() {
  const { quizId = '' } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [active, setActive] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !quizId) return undefined
    let live = true
    void Promise.all([getQuiz(quizId), listQuestions(quizId), listUserAttempts(quizId, user.uid)]).then(([found, questions, attempts]) => {
      if (!live) return
      if (!found || found.status !== 'published') { setError('This quiz is no longer available.'); setLoading(false); return }
      if (questions.length === 0) { setError('This quiz does not have any questions yet.'); setLoading(false); return }
      setQuiz(found)
      setActive(attempts.find((attempt) => attempt.status === 'in_progress') ?? null)
      setAttemptCount(attempts.length)
      setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Quiz details could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [user, quizId])

  async function begin() {
    if (!user || !quiz) return
    setBusy(true); setError('')
    try {
      if (active) { navigate(`/student/quizzes/${quiz.id}/attempts/${active.id}`); return }
      const attemptId = await startAttempt(quiz.id, user.uid, profile?.name || user.displayName || user.email || 'Student')
      navigate(`/student/quizzes/${quiz.id}/attempts/${attemptId}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start this quiz.') }
    finally { setBusy(false) }
  }

  if (loading) return <AppShell><main className="app-shell__content"><Skeleton className="h-72 rounded-3xl" label="Loading quiz" /></main></AppShell>
  if (!quiz) return <AppShell><PageHeader eyebrow="QUIZ" title="Quiz unavailable." subtitle="This quiz may have been unpublished." /><main className="app-shell__content grid gap-4">{error && <Alert tone="error" label="Quiz unavailable">{error}</Alert>}<Button to="/student" variant="secondary">Back to practice</Button></main></AppShell>
  const remaining = remainingAttempts(quiz, attemptCount)
  const isGroup = quiz.settings.participation.type === 'group'
  return <AppShell><PageHeader eyebrow={quiz.mode === 'quiz' ? 'QUIZ INTRODUCTION' : 'FLASHCARDS'} title={`${quiz.title}.`} subtitle={quiz.description || 'Review the details before you begin.'} />
    <main className="app-shell__content grid gap-5"><SectionCard title="Before you start" description="Here is how this practice will work.">
      <ul className="grid gap-3 pl-5"><li>{quiz.settings.timeLimitMinutes ? `You have ${quiz.settings.timeLimitMinutes} minutes once you start.` : 'There is no time limit.'}</li><li>{remaining === null ? 'You can make unlimited attempts.' : `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`}</li><li>{quiz.mode === 'flashcards' ? 'Flip each card and rate how well you knew it. There is no score.' : quiz.settings.answerReveal === 'after_each' ? 'You can check each answer and see its explanation before moving on.' : quiz.settings.answerReveal === 'after_submit' ? 'Answers and explanations appear after you submit.' : 'Correct answers are not revealed.'}</li><li>{quiz.settings.scoreVisibility === 'immediate' ? 'Your score appears immediately after submission.' : quiz.settings.scoreVisibility === 'after_release' ? 'Your instructor will release scores later.' : 'Scores are not shown to students.'}</li></ul>
      {isGroup && <Alert tone="warning" label="Group quizzes coming soon">This quiz is for a group and cannot be started yet.</Alert>}
      {remaining === 0 && !active && !isGroup && <Alert tone="warning" label="No attempts left">You have used all attempts allowed for this quiz.</Alert>}
      {error && <Alert tone="error" label="Could not start quiz">{error}</Alert>}
      <div className="mt-5 flex flex-wrap gap-3"><Button type="button" disabled={busy || isGroup || remaining === 0 && !active} onClick={() => void begin()}>{busy ? 'Opening…' : active ? 'Resume quiz' : 'Start quiz'}</Button><Button to="/student" variant="secondary">Back to practice</Button></div>
    </SectionCard></main></AppShell>
}
