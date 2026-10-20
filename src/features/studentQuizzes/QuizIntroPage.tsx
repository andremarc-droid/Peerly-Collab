import { AlertCircle, BarChart3, CalendarClock, Clock3, Eye, Layers, Repeat2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { getQuiz, type QuizRecord } from '../quizzes/services/quizService'
import { listQuestions } from '../quizzes/services/questionService'
import { listUserAttempts, startAttempt } from '../quizzes/services/attemptService'
import type { QuizAttempt } from '../quizzes/types'
import type { CanvasQuestion } from '../canvas/types'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { remainingAttempts } from './quizLogic'
import { describeWindow, effectiveTimeLimitSeconds, formatDuration, quizWindowState } from '../quizzes/quizTiming'

export function QuizIntroPage() {
  const { quizId = '' } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [canvasQuestion, setCanvasQuestion] = useState<CanvasQuestion | null>(null)
  const [active, setActive] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !quizId) return undefined
    let live = true
    void getQuiz(quizId).then(async (found) => {
      if (!live) return
      if (!found || found.status !== 'published') { setError('This quiz is no longer available.'); setLoading(false); return }
      // Group quizzes are played through the team flow. Students may not read the question list of a group quiz, so go there before loading it.
      if (found.settings.participation.type === 'group') { navigate(`/student/quizzes/${found.id}/team`, { replace: true }); return }
      // Before the opening time the server refuses to show the questions, so only show the details.
      if (quizWindowState(found.settings, Date.now()) === 'not_open_yet') { setQuiz(found); setLoading(false); return }
      const [questions, attempts] = await Promise.all([listQuestions(quizId), listUserAttempts(quizId, user.uid)])
      if (!live) return
      if (questions.length === 0) { setError('This quiz does not have any questions yet.'); setLoading(false); return }
      setQuiz(found)
      if (found.mode === 'canvas') {
        const boardQ = questions.find((q) => (q as { type?: unknown }).type === 'canvas') as unknown as CanvasQuestion | undefined
        if (boardQ) setCanvasQuestion(boardQ)
      }
      setActive(attempts.find((attempt) => attempt.status === 'in_progress') ?? null)
      setAttemptCount(attempts.length)
      setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'Quiz details could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [user, quizId, navigate])

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
  const windowState = quizWindowState(quiz.settings, Date.now())
  const windowText = describeWindow(quiz.settings)
  const limitSeconds = effectiveTimeLimitSeconds(quiz.settings)
  const blockedByWindow = windowState === 'not_open_yet' || (windowState === 'closed' && !active)
  const isCanvas = quiz.mode === 'canvas'
  const isBlankCanvas = isCanvas && quiz.boardKind === 'blank'
  const cardCount = canvasQuestion?.cards?.length ?? 0
  const penaltyText = canvasQuestion?.wrongPenalty === 'none'
    ? 'No penalty for incorrect connections.'
    : canvasQuestion?.wrongPenalty === 'full'
      ? 'Full penalty: incorrect connections deduct the full value of an average connection’s points.'
      : 'Half penalty: incorrect connections deduct half of an average connection’s points.'

  return <AppShell>
    <PageHeader
      eyebrow={isBlankCanvas ? 'BLANK CANVAS' : isCanvas ? 'CANVAS PRACTICE' : quiz.mode === 'quiz' ? 'QUIZ INTRODUCTION' : 'FLASHCARDS'}
      title={`${quiz.title}.`}
      subtitle={quiz.description || 'Review the details before you begin.'}
    />
    <main className="app-shell__content grid gap-5">
      {isBlankCanvas && canvasQuestion?.prompt && (
        <SectionCard title="Instructions" description="Follow your instructor's guidelines to construct your board.">
          <div className="whitespace-pre-wrap text-base text-navy-900 leading-relaxed font-body">
            {canvasQuestion.prompt}
          </div>
          {canvasQuestion.showRubricToStudents && canvasQuestion.rubric && (
            <div className="mt-4 pt-4 border-t border-navy-900-12">
              <h3 className="m-0 text-sm font-semibold uppercase tracking-wider text-navy-700">Grading Rubric</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-navy-900 leading-relaxed">
                {canvasQuestion.rubric}
              </p>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Before you start" description="Here is how this practice will work.">
        <ul className="quiz-expect-list">
          {isBlankCanvas ? (
            <>
              <li>
                <Layers size={20} aria-hidden="true" />
                <span>Add up to {canvasQuestion?.maxCards ?? 20} cards ({canvasQuestion?.allowedCardTypes?.join(', ') ?? 'note, paragraph, link'}).</span>
              </li>
              <li>
                <Share2 size={20} aria-hidden="true" />
                <span>Draw up to {canvasQuestion?.maxConnections ?? 40} connections between cards.</span>
              </li>
              <li>
                <Eye size={20} aria-hidden="true" />
                <span>Your instructor will check your board.</span>
              </li>
            </>
          ) : isCanvas ? (
            <>
              <li>
                <Share2 size={20} aria-hidden="true" />
                <span>Connect the cards that belong together.</span>
              </li>
              <li>
                <Layers size={20} aria-hidden="true" />
                <span>{cardCount} {cardCount === 1 ? 'card' : 'cards'} on the board.</span>
              </li>
              <li>
                <AlertCircle size={20} aria-hidden="true" />
                <span>{penaltyText}</span>
              </li>
            </>
          ) : null}
          <li>
            <Clock3 size={20} aria-hidden="true" />
            <span>{limitSeconds !== null ? `Every question has ${formatDuration(limitSeconds)}. When time runs out you move on automatically, and you can’t go back to earlier questions.` : 'There is no time limit.'}</span>
          </li>
          {windowText && (
            <li>
              <CalendarClock size={20} aria-hidden="true" />
              <span>{windowText}{quiz.settings.closesAt ? ' If you are still working at the deadline, your quiz is submitted automatically.' : ''}</span>
            </li>
          )}
          <li>
            <Repeat2 size={20} aria-hidden="true" />
            <span>{remaining === null ? 'You can make unlimited attempts.' : `${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`}</span>
          </li>
          {!isBlankCanvas && (
            <li>
              <Eye size={20} aria-hidden="true" />
              <span>
                {quiz.mode === 'flashcards'
                  ? 'Flip each card and rate how well you knew it. There is no score.'
                  : quiz.settings.answerReveal === 'after_each'
                    ? 'You can check each answer and see its explanation before moving on.'
                    : quiz.settings.answerReveal === 'after_submit'
                      ? quiz.settings.scoreVisibility === 'immediate' || quiz.settings.scoresReleased
                        ? 'Answers and explanations appear after you submit.'
                        : quiz.settings.scoreVisibility === 'after_release'
                          ? 'Answers and explanations will appear after your instructor releases results.'
                          : 'Answers and explanations are not shown for this quiz.'
                      : 'Correct answers are not revealed.'}
              </span>
            </li>
          )}
          <li>
            <BarChart3 size={20} aria-hidden="true" />
            <span>
              {isBlankCanvas
                ? 'Your instructor will grade your board and provide feedback.'
                : quiz.settings.scoreVisibility === 'immediate'
                  ? 'Your score appears immediately after submission.'
                  : quiz.settings.scoreVisibility === 'after_release'
                    ? 'Your instructor will release scores later.'
                    : 'Scores are not shown to students.'}
            </span>
          </li>
        </ul>
        {remaining === 0 && !active && <Alert tone="warning" label="No attempts left">You have used all attempts allowed for this quiz.</Alert>}
        {windowState === 'not_open_yet' && <Alert tone="info" label="Not open yet">{windowText ?? 'This quiz has not opened yet.'} Come back when it opens.</Alert>}
        {windowState === 'closed' && <Alert tone="warning" label="Deadline passed">{active ? 'The deadline has passed. Open your attempt to submit what you have.' : `${windowText ?? ''} You can no longer start this quiz.`.trim()}</Alert>}
        {error && <Alert tone="error" label="Could not start quiz">{error}</Alert>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" disabled={busy || blockedByWindow || (remaining === 0 && !active)} onClick={() => void begin()}>
            {busy ? 'Opening…' : active ? 'Resume quiz' : 'Start quiz'}
          </Button>
          <Button to="/student" variant="secondary">Back to practice</Button>
        </div>
      </SectionCard>
    </main>
  </AppShell>
}
