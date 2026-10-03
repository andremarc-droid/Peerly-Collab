import { useEffect, useState } from 'react'
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
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { PageHeader } from '../../shared/ui/PageHeader'
import { SectionCard } from '../../shared/ui/SectionCard'
import { Skeleton } from '../../shared/ui/Skeleton'
import { resultVisibility, persistedQuestionOrder } from './quizLogic'

type QuestionRecord = QuizQuestion & { id: string }
type ReviewItem = { question: QuestionRecord; key: AnswerKey | null }
const answerText = (answer: string | string[] | undefined) => Array.isArray(answer) ? answer.join(' / ') : answer || 'No answer submitted'

export function QuizResultPage() {
  const { quizId = '', attemptId = '' } = useParams()
  const { user } = useAuth()
  const [quiz, setQuiz] = useState<Awaited<ReturnType<typeof getQuiz>>>(null)
  const [attempt, setAttempt] = useState<(QuizAttempt & { id: string }) | null>(null)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [review, setReview] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return undefined
    let live = true
    void Promise.all([getQuiz(quizId), getAttempt(quizId, attemptId), getQuizResult(quizId, attemptId), listQuestions(quizId)]).then(async ([foundQuiz, foundAttempt, foundResult, raw]) => {
      if (!live) return
      if (!foundQuiz || !foundAttempt || !foundResult || foundAttempt.userId !== user.uid) { setError('The submitted result could not be found.'); setLoading(false); return }
      const questions = persistedQuestionOrder(foundAttempt, raw.map((item) => ({ ...parseQuestion(item), id: item.id })))
      const visibility = resultVisibility(foundQuiz, foundQuiz.settings.answerReveal, foundResult)
      const items = await Promise.all(questions.map(async (question) => ({ question, key: visibility.showAnswers ? (await getQuestionWithKey(quizId, question.id))?.answerKey ?? null : null })))
      if (!live) return
      setQuiz(foundQuiz); setAttempt({ ...foundAttempt, id: attemptId }); setResult(foundResult); setReview(items); setLoading(false)
    }).catch((reason: unknown) => { if (live) { setError(reason instanceof Error ? reason.message : 'The result could not be loaded.'); setLoading(false) } })
    return () => { live = false }
  }, [user, quizId, attemptId])

  if (loading) return <AppShell><main className="app-shell__content"><Skeleton className="h-80 rounded-3xl" label="Loading result" /></main></AppShell>
  if (error || !quiz || !attempt || !result) return <AppShell><PageHeader eyebrow="RESULT" title="Result unavailable." subtitle="We couldn’t load this submission." /><main className="app-shell__content grid gap-4"><Alert tone="error" label="Result unavailable">{error}</Alert><Button to="/student" variant="secondary">Back to practice</Button></main></AppShell>
  const visibility = resultVisibility(quiz, quiz.settings.answerReveal, result)
  return <AppShell><PageHeader eyebrow="SUBMISSION COMPLETE" title="Your result." subtitle={quiz.title} />
    <main className="app-shell__content grid gap-5"><SectionCard title={visibility.showScore ? 'Your score' : 'Submitted'} description={visibility.showScore ? `Attempt ${attempt.attemptNumber} · Submitted ${attempt.submittedAt?.toDate().toLocaleString() ?? ''}` : 'Your instructor will share results when they are ready.'}>
      {quiz.mode === 'flashcards' ? <p className="m-0">You reviewed {review.length} cards. Keep practicing to strengthen what you know.</p> : visibility.showScore ? <p className="m-0 font-heading text-3xl">{result.score} / {result.maxScore}</p> : <Alert tone="warning" label="Results are not available yet">Submitted, your instructor will share results.</Alert>}
    </SectionCard>
    {visibility.showAnswers && <section className="grid gap-4" aria-labelledby="review-heading"><h2 id="review-heading" className="m-0 font-heading text-2xl">Question review</h2>{review.map(({ question, key }, index) => {
      const grade = result.perQuestion[question.id]
      return <SectionCard key={question.id} title={`Question ${index + 1}`} description={question.prompt}>
        {quiz.mode !== 'flashcards' && visibility.showScore && <Badge>{grade?.correct ? 'Correct' : 'Needs practice'} · {grade?.pointsAwarded ?? 0} / {question.points}</Badge>}
        <p className="mt-3 mb-0"><strong>Your answer:</strong> {answerText(attempt.answers[question.id])}</p>
        {key && <p className="mt-2 mb-0"><strong>Answer:</strong> {key.type === 'choice' && 'options' in question ? question.options.find(({ id }) => id === key.correctOptionId)?.text : key.type === 'identification' ? key.acceptedAnswers.join(', ') : key.type === 'fill_blank' ? key.blanks.map((blank) => blank.join(' / ')).join(' · ') : key.type === 'flashcard' ? key.back : ''}</p>}
        {key?.explanation && <p className="mt-2 mb-0">{key.explanation}</p>}
      </SectionCard>
    })}</section>}
    <Button to="/student">Back to practice</Button></main>
  </AppShell>
}
