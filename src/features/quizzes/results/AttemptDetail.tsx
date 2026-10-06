import { CircleCheck, CircleHelp, CircleX, Clock3, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../../../shared/ui/Badge'
import { Button } from '../../../shared/ui/Button'
import { Input } from '../../../shared/ui/Input'
import { SectionCard } from '../../../shared/ui/SectionCard'
import { useToast } from '../../../shared/ui/useToast'
import { setQuestionGradeOverride } from '../services/resultService'
import type { QuizResult } from '../types'
import type { SavedQuestion } from '../services/questionService'
import { CanvasReviewView } from '../../canvas/components/CanvasReviewView'
import type { CanvasAnswerKey, CanvasQuestion } from '../../canvas/types'
import { computeTimeSpent, isLate, type AttemptResult } from './resultLogic'

interface Props { quizId: string; attempt: AttemptResult; questions: SavedQuestion[]; ungraded: boolean; onGradeChanged: (result: QuizResult) => void; timeLimitMinutes?: number | null }

export function AttemptDetail({ quizId, attempt, questions, ungraded, onGradeChanged, timeLimitMinutes }: Props) {
  const { showToast } = useToast()
  const [points, setPoints] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
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
      const grade = result.perQuestion[id]
      const answer = attempt.answers[id]
      const answerText = Array.isArray(answer) ? answer.join(' · ') : answer || 'No answer submitted'
      const correctAnswer = answerKey.type === 'choice' && 'options' in question
        ? question.options.find(({ id: optionId }) => optionId === answerKey.correctOptionId)?.text
        : answerKey.type === 'identification' ? answerKey.acceptedAnswers.join(' / ')
          : answerKey.type === 'fill_blank' ? answerKey.blanks.map((blank) => blank.join(' / ')).join(' · ')
            : answerKey.type === 'flashcard' ? answerKey.back : ''
      return <SectionCard key={id} title={`Question ${index + 1}`} description={question.prompt}>
        {question.type === 'flashcard' ? <><p className="m-0"><strong>Student’s rating:</strong> {answer === 'knew' ? 'Knew it' : answer === 'learning' ? 'Still learning' : 'Not rated'}</p>{answerKey.type === 'flashcard' && <p className="m-0"><strong>Card back:</strong> {answerKey.back}</p>}</> : question.type === 'canvas' && answerKey.type === 'canvas' ? (
          <div className="grid gap-3">
            <CanvasReviewView
              question={question as unknown as CanvasQuestion}
              attemptId={attempt.id}
              studentAnswer={answer}
              answerKey={answerKey as unknown as CanvasAnswerKey}
            />
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
