import { CheckCircle2, CircleCheck, CircleHelp, CircleX, Clock3, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { Textarea } from '../../../shared/ui/Textarea'
import { useToast } from '../../../shared/ui/useToast'
import { gradeBlankCanvasAttempt, setQuestionGradeOverride } from '../services/resultService'
import type { BlankCanvasAnswer, QuizResult } from '../types'
import type { SavedQuestion } from '../services/questionService'
import CanvasBoard from '../../canvas/components/CanvasBoard'
import { CanvasReviewView } from '../../canvas/components/CanvasReviewView'
import { ExpandableCanvasContainer } from '../../canvas/components/ExpandableCanvasContainer'
import { CanvasTextOutline } from '../../canvas/components/CanvasTextOutline'
import type { CanvasAnswerKey, CanvasCard, CanvasQuestion } from '../../canvas/types'
import { computeTimeSpent, isLate, type AttemptResult } from './resultLogic'
import { toDataUrl } from '../../canvas/imageProcessing'
import { listImages } from '../../canvas/imageService'

interface Props {
  quizId: string
  attempt: AttemptResult
  questions: SavedQuestion[]
  ungraded: boolean
  onGradeChanged: (result: QuizResult) => void
  timeLimitMinutes?: number | null
  isBlankCanvas?: boolean
  allAttempts?: AttemptResult[]
  onSelectAttempt?: (attempt: AttemptResult) => void
}

export function AttemptDetail({
  quizId,
  attempt,
  questions,
  ungraded,
  onGradeChanged,
  timeLimitMinutes,
  isBlankCanvas = false,
  allAttempts = [],
  onSelectAttempt,
}: Props) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [points, setPoints] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [canvasImages, setCanvasImages] = useState<Record<string, { dataUrl: string; alt?: string }>>({})
  const [canvasImagesError, setCanvasImagesError] = useState(false)

  // Blank Canvas manual grading state
  const [blankScore, setBlankScore] = useState<string>(() => String(attempt.result?.score ?? 0))
  const [blankFeedback, setBlankFeedback] = useState<string>(() => attempt.result?.feedback ?? '')
  const [gradeSaved, setGradeSaved] = useState<boolean>(() => attempt.result?.reviewStatus === 'graded')
  const [savingGrade, setSavingGrade] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  useEffect(() => {
    setBlankScore(String(attempt.result?.score ?? 0))
    setBlankFeedback(attempt.result?.feedback ?? '')
    setGradeSaved(attempt.result?.reviewStatus === 'graded')
  }, [attempt])

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
    const hasCanvasImages = questions.some(
      (q) => q.question.type === 'canvas' && (q.question as CanvasQuestion).cards?.some((c) => c.type === 'image' && c.imageId),
    )
    if (hasCanvasImages) {
      void loadCanvasImages()
    }
  }, [questions, loadCanvasImages])

  const result = attempt.result
  if (!result) return <p>This attempt is submitted, but its result is not available.</p>

  const lateInfo = isLate(attempt.startedAt, attempt.submittedAt, timeLimitMinutes)

  async function changeGrade(questionId: string, pointsAwarded: number | null) {
    setBusy(questionId)
    try {
      await setQuestionGradeOverride(quizId, attempt.id, questionId, pointsAwarded)
      const fresh = await import('../services/resultService').then(({ getQuizResult }) => getQuizResult(quizId, attempt.id))
      if (!fresh) throw new Error('The updated result could not be loaded.')
      onGradeChanged(fresh); showToast('success', pointsAwarded === null ? 'Automatic grade restored.' : 'Question grade updated.')
    } catch (reason) { showToast('error', reason instanceof Error ? reason.message : 'The grade could not be updated.') }
    finally { setBusy(null) }
  }

  const timeSpent = attempt.status === 'submitted' ? computeTimeSpent(attempt.startedAt, attempt.submittedAt) : null

  if (isBlankCanvas) {
    const ungradedAttempts = allAttempts.filter(
      (a) => a.status === 'submitted' && a.result?.reviewStatus !== 'graded',
    )
    const currentUngradedIndex = ungradedAttempts.findIndex((a) => a.id === attempt.id)
    const prevUngraded = currentUngradedIndex > 0 ? ungradedAttempts[currentUngradedIndex - 1] : null
    const nextUngraded =
      currentUngradedIndex >= 0 && currentUngradedIndex < ungradedAttempts.length - 1
        ? ungradedAttempts[currentUngradedIndex + 1]
        : currentUngradedIndex === -1 && ungradedAttempts.length > 0
        ? ungradedAttempts[0]
        : null

    const boardQ = (questions.find((q) => q.question.type === 'canvas')?.question ?? questions[0]?.question) as CanvasQuestion | undefined
    const maxPoints = boardQ?.points ?? result.maxScore ?? 100

    const boardAnswer = attempt.answers.board as BlankCanvasAnswer | undefined
    const rawStudentCards = (boardAnswer?.cards ?? []) as CanvasCard[]
    const studentConnections = boardAnswer?.connections ?? []

    const studentCards = rawStudentCards.map((c) => ({
      ...c,
      selected: c.id === selectedCardId,
    }))

    const cardPositions: Record<string, { x: number; y: number }> = {}
    studentCards.forEach((c) => {
      cardPositions[c.id] = c.position
    })

    const handleSaveBlankGrade = async () => {
      const num = Number(blankScore)
      if (!Number.isFinite(num) || num < 0 || num > maxPoints) {
        showToast('error', `Score must be between 0 and ${maxPoints}`)
        return
      }
      if (blankFeedback.length > 1000) {
        showToast('error', 'Feedback must not exceed 1000 characters')
        return
      }
      setSavingGrade(true)
      try {
        await gradeBlankCanvasAttempt(quizId, attempt.id, {
          score: num,
          feedback: blankFeedback.trim(),
          gradedBy: user?.uid ?? 'instructor',
        })
        const fresh = await import('../services/resultService').then(({ getQuizResult }) => getQuizResult(quizId, attempt.id))
        if (fresh) {
          onGradeChanged(fresh)
        }
        setGradeSaved(true)
        showToast('success', 'Grade saved.')
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Could not save grade.')
      } finally {
        setSavingGrade(false)
      }
    }

    return (
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-2xl border border-navy-900-12 shadow-sm">
          <div className="flex items-center gap-2">
            <Badge>{result.reviewStatus === 'graded' ? 'Graded' : 'Needs grading'}</Badge>
            <span className="text-sm font-semibold text-navy-900">
              {result.reviewStatus === 'graded' ? `${result.score} / ${maxPoints} points` : 'Awaiting instructor grade'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!prevUngraded}
              onClick={() => prevUngraded && onSelectAttempt?.(prevUngraded)}
            >
              Previous ungraded
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!nextUngraded}
              onClick={() => nextUngraded && onSelectAttempt?.(nextUngraded)}
            >
              Next ungraded
            </Button>
          </div>
        </div>

        {boardQ?.prompt && (
          <SectionCard title="Instructions & rubric" description={boardQ.prompt}>
            {boardQ.rubric && (
              <div className="rounded-xl bg-navy-50 p-3 text-sm text-navy-900 border border-navy-900-12">
                <strong>Rubric:</strong> {boardQ.rubric}
              </div>
            )}
          </SectionCard>
        )}

        <SectionCard
          title="Student board submission"
          description={`${studentCards.length} ${studentCards.length === 1 ? 'card' : 'cards'} · ${studentConnections.length} ${studentConnections.length === 1 ? 'connection' : 'connections'}`}
        >
          {studentCards.length === 0 ? (
            <p className="m-0 text-sm text-navy-800-72">The student did not add any cards to their board.</p>
          ) : (
            <ExpandableCanvasContainer title="Student concept board">
              <div className="flex-1 min-w-0 h-full relative rounded-2xl border border-navy-900-12 overflow-hidden bg-navy-50 shadow-sm">
                <CanvasBoard
                  cards={studentCards}
                  connections={studentConnections}
                  mode="review"
                  directed={boardQ?.directed ?? false}
                  positions={cardPositions}
                  onCardClick={(c) => setSelectedCardId((prev) => (prev === c.id ? null : c.id))}
                  className="w-full h-full"
                />
              </div>
              <CanvasTextOutline
                cards={rawStudentCards}
                connections={studentConnections}
                directed={boardQ?.directed ?? false}
                selectedCardId={selectedCardId}
                onSelectCard={setSelectedCardId}
              />
            </ExpandableCanvasContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Grade submission"
          description={`Award points and provide constructive feedback (maximum ${maxPoints} points).`}
        >
          <div className="grid gap-3">
            <Input
              label={`Score (0 to ${maxPoints}, step 0.5)`}
              name="blank-score-input"
              type="number"
              min={0}
              max={maxPoints}
              step={0.5}
              value={blankScore}
              onChange={(e) => {
                setBlankScore(e.target.value)
                setGradeSaved(false)
              }}
            />
            <Textarea
              label="Feedback"
              name="blank-feedback-input"
              value={blankFeedback}
              onChange={(e) => {
                setBlankFeedback(e.target.value)
                setGradeSaved(false)
              }}
              maxLength={1000}
              hint={`${blankFeedback.length}/1000 characters`}
              rows={3}
            />
            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                disabled={savingGrade}
                onClick={() => void handleSaveBlankGrade()}
              >
                {savingGrade ? 'Saving grade…' : 'Save grade'}
              </Button>
              {gradeSaved && (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-feedback-success" role="status">
                  <CheckCircle2 size={16} aria-hidden="true" /> Grade saved
                </span>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    )
  }

  return <div className="grid gap-4">
    <SectionCard
      title="Attempt summary"
      description={`${attempt.submittedAt?.toDate().toLocaleString() ?? 'Submitted'} · ${timeSpent !== null ? `${timeSpent} seconds` : '—'}`}
      action={
        lateInfo.late ? (
          <span className="flex items-center gap-2">
            <Badge className="inline-flex items-center gap-1">
              <Clock3 size={13} aria-hidden="true" /> Late
            </Badge>
            <span className="text-sm font-medium text-navy-700">
              Late by {Math.max(1, Math.round(lateInfo.lateBySeconds / 60))} min
            </span>
          </span>
        ) : undefined
      }
    >
      {!ungraded && <p className="m-0">{result.score} / {result.maxScore} points</p>}
    </SectionCard>
    {questions.map(({ id, question, answerKey }, index) => {
      if (!answerKey) return null
      const grade = result.perQuestion[id]
      const answer = attempt.answers[id]
      const answerText = Array.isArray(answer)
        ? answer.join(' · ')
        : typeof answer === 'string'
        ? answer
        : 'No answer submitted'
      const correctAnswer = answerKey.type === 'choice' && 'options' in question
        ? question.options.find(({ id: optionId }) => optionId === answerKey.correctOptionId)?.text
        : answerKey.type === 'identification' ? answerKey.acceptedAnswers.join(' / ')
          : answerKey.type === 'fill_blank' ? answerKey.blanks.map((blank: string[]) => blank.join(' / ')).join(' · ')
            : answerKey.type === 'flashcard' ? answerKey.back : ''
      return <SectionCard key={id} title={`Question ${index + 1}`} description={question.prompt}>
        {question.type === 'flashcard' ? <><p className="m-0"><strong>Student’s rating:</strong> {answer === 'knew' ? 'Knew it' : answer === 'learning' ? 'Still learning' : 'Not rated'}</p>{answerKey.type === 'flashcard' && <p className="m-0"><strong>Card back:</strong> {answerKey.back}</p>}</> : question.type === 'canvas' && answerKey.type === 'canvas' ? (
          <div className="grid gap-3">
            <CanvasReviewView
              question={question as unknown as CanvasQuestion}
              attemptId={attempt.id}
              studentAnswer={typeof answer === 'string' || Array.isArray(answer) ? answer : undefined}
              answerKey={answerKey as unknown as CanvasAnswerKey}
              images={canvasImages}
            />
            {canvasImagesError && (
              <div className="flex items-center gap-2 text-sm text-navy-800 bg-navy-50 border border-navy-900-12 rounded-xl px-3 py-2" role="status">
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
            <p className="m-0"><span className={`attempt-status ${grade?.correct === true ? 'attempt-status--correct' : grade?.correct === false ? 'attempt-status--incorrect' : ''}`}>{grade?.correct === true ? <CircleCheck size={16} aria-hidden="true" /> : grade?.correct === false ? <CircleX size={16} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}{grade?.correct === true ? 'Correct' : grade?.correct === false ? 'Incorrect' : 'Not graded'} · {grade?.pointsAwarded ?? 0} / {question.points} points{grade?.overridden ? ' · Instructor override' : ''}</span></p>
            <div className="mt-2 grid gap-3 rounded-2xl border border-navy/15 p-4">
              <strong>Override grade</strong>
              <Input label={`Points awarded (0–${question.points})`} type="number" min={0} max={question.points} step="any" value={points[id] ?? String(grade?.pointsAwarded ?? 0)} onChange={(event) => setPoints((current) => ({ ...current, [id]: event.target.value }))} />
              <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy === id} onClick={() => void changeGrade(id, question.points)}>Mark full points</Button><Button type="button" variant="secondary" disabled={busy === id || !Number.isFinite(Number(points[id] ?? grade?.pointsAwarded))} onClick={() => void changeGrade(id, Number(points[id] ?? grade?.pointsAwarded))}>Save points</Button>{grade?.overridden && <Button type="button" variant="secondary" disabled={busy === id} onClick={() => void changeGrade(id, null)}><RotateCcw size={15} aria-hidden="true" /> Restore automatic grade</Button>}</div>
            </div>
          </div>
        ) : <>
          <div className="attempt-answer-grid"><div className="attempt-answer-block"><strong>Student answer</strong><span>{answerText}</span></div><div className="attempt-answer-block"><strong>Correct answer</strong><span>{correctAnswer || '—'}</span></div></div>
          <p className="m-0"><span className={`attempt-status ${grade?.correct === true ? 'attempt-status--correct' : grade?.correct === false ? 'attempt-status--incorrect' : ''}`}>{grade?.correct === true ? <CircleCheck size={16} aria-hidden="true" /> : grade?.correct === false ? <CircleX size={16} aria-hidden="true" /> : <CircleHelp size={16} aria-hidden="true" />}{grade?.correct === true ? 'Correct' : grade?.correct === false ? 'Incorrect' : 'Not graded'} · {grade?.pointsAwarded ?? 0} / {question.points} points{grade?.overridden ? ' · Instructor override' : ''}</span></p>
          {answerKey.explanation && <p className="m-0"><strong>Explanation:</strong> {answerKey.explanation}</p>}
          {(question.type === 'identification' || question.type === 'fill_blank') && <div className="mt-3 grid gap-3 rounded-2xl border border-navy/15 p-4">
            <strong>Override grade</strong>
            <Input label={`Points awarded (0–${question.points})`} type="number" min={0} max={question.points} step="any" value={points[id] ?? String(grade?.pointsAwarded ?? 0)} onChange={(event) => setPoints((current) => ({ ...current, [id]: event.target.value }))} />
            <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy === id} onClick={() => void changeGrade(id, question.points)}>Mark correct</Button><Button type="button" variant="secondary" disabled={busy === id || !Number.isFinite(Number(points[id] ?? grade?.pointsAwarded))} onClick={() => void changeGrade(id, Number(points[id] ?? grade?.pointsAwarded))}>Save points</Button>{grade?.overridden && <Button type="button" variant="secondary" disabled={busy === id} onClick={() => void changeGrade(id, null)}><RotateCcw size={15} aria-hidden="true" /> Restore automatic grade</Button>}</div>
          </div>}
        </>}
      </SectionCard>
    })}
  </div>
}
