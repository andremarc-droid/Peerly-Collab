import { Check, Eraser } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { parsePoints } from './format'
import { MAX_FEEDBACK_LENGTH, type TurnInWithId } from './types'

interface GradeFormProps {
  turnIn: Pick<TurnInWithId, 'studentName' | 'studentId' | 'grade' | 'feedback' | 'gradedAt'>
  /** The assignment's points. Null means the assignment is ungraded, so only feedback can be given. */
  points: number | null
  onSave: (grade: number | null, feedback: string) => Promise<void>
  onClear: () => Promise<void>
}

/**
 * Grade and feedback for one student's work. The parent gives it a `key` that changes when the saved grade changes,
 * so the fields always start from what is stored.
 */
export function GradeForm({ turnIn, points, onSave, onClear }: GradeFormProps) {
  const [gradeText, setGradeText] = useState(turnIn.grade === null ? '' : String(turnIn.grade))
  const [feedback, setFeedback] = useState(turnIn.feedback)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const graded = turnIn.gradedAt !== null
  const parsed = parsePoints(gradeText)
  const empty = !gradeText.trim() && !feedback.trim()
  const unchanged = graded && parsed === turnIn.grade && feedback.trim() === turnIn.feedback
  const gradeError = parsed === undefined
    ? 'Enter a whole number of points, 0 or more.'
    : parsed !== null && points !== null && parsed > points ? `The most you can give is ${points}.` : undefined
  const name = turnIn.studentName

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The grade could not be saved.') }
    finally { setBusy(false) }
  }

  return <div className="grade-form" role="group" aria-label={`Grade for ${name}`}>
    {points === null && <p className="m-0 text-sm text-navy-800-72">This assignment has no points, so you can only leave feedback. Add points in the assignment’s Details to give a grade.</p>}
    <div className="grade-form__fields">
      <Input label="Grade" name={`grade-${turnIn.studentId}`} inputMode="numeric" value={gradeText} disabled={points === null || busy}
        onChange={(event) => setGradeText(event.target.value)} error={gradeError} hint={points === null ? undefined : `Out of ${points}`} />
      <Textarea label="Feedback for the student" name={`feedback-${turnIn.studentId}`} value={feedback} rows={3} maxLength={MAX_FEEDBACK_LENGTH} disabled={busy}
        onChange={(event) => setFeedback(event.target.value)} hint="Optional · the student can read this" />
    </div>
    {error && <Alert tone="error" label="Not saved">{error}</Alert>}
    <div className="assignment-actions">
      <Button type="button" disabled={busy || empty || unchanged || Boolean(gradeError)} onClick={() => void run(() => onSave(parsed ?? null, feedback))}><Check size={16} aria-hidden="true" /> {busy ? 'Saving…' : graded ? 'Update grade' : 'Save grade'}</Button>
      {graded && <Button type="button" variant="secondary" disabled={busy} onClick={() => void run(onClear)}><Eraser size={16} aria-hidden="true" /> Clear grade</Button>}
    </div>
    {graded && <p className="m-0 text-sm text-navy-800-72">Graded work is locked for the student. Clear the grade if they need to change their files.</p>}
  </div>
}
