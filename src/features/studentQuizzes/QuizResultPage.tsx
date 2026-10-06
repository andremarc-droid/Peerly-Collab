import { CircleCheck, CircleX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../../app/AppShell'
import { useAuth } from '../auth/useAuth'
import { getQuiz } from '../quizzes/services/quizService'
import { getAttempt } from '../quizzes/services/attemptService'
import { getQuizResult } from '../quizzes/services/resultService'
import { getQuestionWithKey, listQuestions } from '../quizzes/services/questionService'
import type { AnswerKey, QuizAttempt, QuizResult, QuizQuestion } from '../quizzes/types'
import { parseQuestion } from '../quizzes/schemas'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resultVisibility, persistedQuestionOrder } from './quizLogic'
import { isLate } from '../quizzes/results/resultLogic'
import { CanvasReviewView } from '../canvas/components/CanvasReviewView'
import type { CanvasAnswerKey, CanvasCard, CanvasQuestion } from '../canvas/types'
import type { BlankCanvasAnswer } from '../quizzes/types'
import { toDataUrl } from '../canvas/imageProcessing'
import { listImages } from '../canvas/imageService'
import { lazy, Suspense } from 'react'

const CanvasBoard = lazy(() => import('../canvas/components/CanvasBoard'))

type QuestionRecord = QuizQuestion & { id: string }
type ReviewItem = { question: QuestionRecord; key: AnswerKey | null }
const answerText = (answer: unknown) => Array.isArray(answer) ? answer.join(' / ') : typeof answer === 'string' ? answer : 'No answer submitted'

export function QuizResultPage() {
  const { quizId = '', attemptId = '' } = useParams()
  const { user } = useAuth()
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof getQuiz>>>(null)
  const [attempt, setAttempt] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    if (!user) return undefined
    let live = true
    void Promise.all([getQuiz(quizId), getAttempt(quizId, attemptId), getQuizResult(quizId, attemptId), listQuestions(quizId)]).then(async ([foundQuiz, foundAttempt, foundResult, raw]) => {
      if (!live) return
      if (!foundQuiz || !foundAttempt || !foundResult || foundAttempt.userId !== user.uid) { setError('The submitted result could not be found.'); setLoading(false); return }
      const questions = persistedQuestionOrder(foundAttempt, raw.map(({ id, ...value }) => ({ ...parseQuestion(value), id })))
      const visibility = resultVisibility(foundQuiz, foundQuiz.settings.answerReveal, foundResult)
      const items = await Promise.all(questions.map(async (question) => ({ question, key: visibility.showAnswers ? (await getQuestionWithKey(quizId, question.id))?.answerKey ?? null : null })))
      if (!live) return

      const hasCanvasImages = items.some(
        (item) => item.question.type === 'canvas' && (item.question as unknown as CanvasQuestion).cards?.some((c) => c.type === 'image' && c.imageId)
      )
      if (hasCanvasImages) {
        void loadCanvasImages()
      }

      setQuiz(foundQuiz); setAttempt({ ...foundAttempt, id: attemptId }); setResult(foundResult); setReview(items); setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'The result could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [user, quizId, attemptId, loadCanvasImages])

  if (loading) return <AppShell><main className="app-shell__content"><Skeleton className="h-80 rounded-3xl" label="Loading result" /></main></AppShell>
  if (error || !quiz || !attempt || !result) return <AppShell><PageHeader eyebrow="RESULT" title="Result unavailable." subtitle="We couldn’t load this submission." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Result unavailable">{error}</Alert><Button to="/student" variant="secondary">Back to practice</Button></main></AppShell>
  const visibility = resultVisibility(quiz, quiz.settings.answerReveal, result)
  const late = isLate(attempt.startedAt, attempt.submittedAt, quiz.settings.timeLimitMinutes).late
  const isBlankCanvas = quiz.mode === 'canvas' && quiz.boardKind === 'blank'
  const isGraded = result.reviewStatus === 'graded'

  const boardReviewItem = review.find((item) => item.question.type === 'canvas') ?? review[0]
  const boardQ = boardReviewItem?.question as CanvasQuestion | undefined
  const boardAnswer = attempt.answers[boardReviewItem?.question?.id ?? 'board'] as BlankCanvasAnswer | undefined
  const blankCards = (boardAnswer?.cards ?? []) as CanvasCard[]
  const blankConnections = boardAnswer?.connections ?? []

  return <AppShell><PageHeader eyebrow="SUBMISSION COMPLETE" title="Your result." subtitle={quiz.title} />
    <main className="app-shell__content grid gap-5">
      {late && <Alert tone="warning" label="Late submission">Submitted after the time limit. Your instructor may review this.</Alert>}
      {isBlankCanvas ? (
        <SectionCard
          title={isGraded && visibility.showScore ? 'Your score' : 'Submitted'}
          description={
            isGraded && visibility.showScore
              ? `Attempt ${attempt.attemptNumber} · Graded by instructor · Submitted ${attempt.submittedAt?.toDate().toLocaleString() ?? ''}`
              : 'Your instructor will check your board.'
          }
        >
          {isGraded && visibility.showScore ? (
            <div className="grid gap-4">
              <div className="quiz-score-summary">
                <ScoreRing percent={result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0} />
                <strong>{result.score} / {result.maxScore} points</strong>
              </div>
              {result.feedback && (
                <div className="p-4 bg-navy-900-5 rounded-2xl border border-navy-900-12">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-navy-800-72">Instructor feedback</span>
                  <p className="m-0 mt-1 whitespace-pre-wrap text-base text-navy-900 font-medium">{result.feedback}</p>
                </div>
              )}
            </div>
          ) : (
            <Alert tone="info" label="Submitted">
              Submitted. Your instructor will check your board.
            </Alert>
          )}

          {boardQ?.showRubricToStudents && boardQ.rubric && (
            <div className="mt-4 pt-4 border-t border-navy-900-12">
              <span className="block text-xs font-semibold uppercase tracking-wider text-navy-800-72">Grading rubric</span>
              <p className="m-0 mt-1 whitespace-pre-wrap text-sm text-navy-900 leading-relaxed">{boardQ.rubric}</p>
            </div>
          )}

          <div className="mt-4">
            <h3 className="m-0 text-base font-semibold text-navy-900 mb-2">Your submitted board</h3>
            <div className="w-full h-[540px] bg-white rounded-3xl border border-navy-900-12 overflow-hidden shadow-sm">
              <Suspense fallback={<Skeleton label="Loading canvas board" className="w-full h-full" />}>
                <CanvasBoard
                  cards={blankCards}
                  connections={blankConnections}
                  mode="review"
                  directed={boardQ?.directed ?? false}
                  className="w-full h-full"
                />
              </Suspense>
            </div>
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard title={visibility.showScore ? 'Your score' : 'Submitted'} description={visibility.showScore ? `Attempt ${attempt.attemptNumber} · Submitted ${attempt.submittedAt?.toDate().toLocaleString() ?? ''}` : 'Your instructor will share results when they are ready.'}>
            {quiz.mode === 'flashcards' ? <p className="m-0">You rated {Object.values(attempt.answers).filter((answer) => answer === 'knew' || answer === 'learning').length} of {review.length} cards. Keep practicing to strengthen what you know.</p> : visibility.showScore ? <div className="quiz-score-summary"><ScoreRing percent={result.maxScore > 0 ? Math.round(result.score / result.maxScore * 100) : 0} /><strong>{result.score} / {result.maxScore} points</strong></div> : <Alert tone="warning" label="Results are not available yet">Submitted, your instructor will share results.</Alert>}
          </SectionCard>
          {visibility.showAnswers && <section className="grid gap-4" aria-labelledby="review-heading"><h2 id="review-heading" className="m-0 font-heading text-2xl">Question review</h2>{review.map(({ question, key }, index) => {
            const grade = result.perQuestion[question.id]
            return <SectionCard key={question.id} title={`Question ${index + 1}`} description={question.prompt}>
              {quiz.mode !== 'flashcards' && visibility.showScore && <span className={`attempt-status ${grade?.correct ? 'attempt-status--correct' : 'attempt-status--incorrect'}`}>{grade?.correct ? <CircleCheck size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}{grade?.correct ? 'Correct' : 'Needs practice'} · {grade?.pointsAwarded ?? 0} / {question.points}</span>}
              {question.type === 'canvas' && key?.type === 'canvas' ? (
                <div className="mt-3">
                  <CanvasReviewView
                    question={question as unknown as CanvasQuestion}
                    attemptId={attemptId}
                    studentAnswer={typeof attempt.answers[question.id] === 'string' || Array.isArray(attempt.answers[question.id]) ? (attempt.answers[question.id] as string | string[]) : undefined}
                    answerKey={key as unknown as CanvasAnswerKey}
                    images={canvasImages}
                  />
                  {canvasImagesError && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-navy-800 bg-navy-50 border border-navy-900-12 rounded-xl px-3 py-2" role="status">
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
                  <p className="mt-3 mb-0"><strong>Your answer:</strong> {answerText(attempt.answers[question.id])}</p>
                  {key && <p className="mt-2 mb-0"><strong>Answer:</strong> {key.type === 'choice' && 'options' in question ? question.options.find(({ id }) => id === key.correctOptionId)?.text : key.type === 'identification' ? key.acceptedAnswers.join(', ') : key.type === 'fill_blank' ? key.blanks.map((blank) => blank.join(' / ')).join(' · ') : key.type === 'flashcard' ? key.back : ''}</p>}
                  {key?.explanation && <p className="mt-2 mb-0">{key.explanation}</p>}
                </>
              )}
            </SectionCard>
          })}</section>}
        </>
      )}
      <Button to="/student">Back to practice</Button></main>
  </AppShell>
}

function ScoreRing({ percent }: { percent: number }) {
  const circumference = 276
  const offset = circumference - circumference * Math.max(0, Math.min(100, percent)) / 100
  return <svg className="quiz-score-ring" viewBox="0 0 100 100" role="img" aria-label={`Score ${percent} percent`}><circle className="quiz-score-ring__track" cx="50" cy="50" r="44" fill="none" strokeWidth="6" /><circle className="quiz-score-ring__value" cx="50" cy="50" r="44" fill="none" strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" /><text x="50" y="54" textAnchor="middle" className="quiz-score-ring__text">{percent}%</text></svg>
}
