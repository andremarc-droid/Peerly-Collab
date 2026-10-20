import { Hourglass, TriangleAlert } from 'lucide-react'
import { formatClock } from '../quizzes/quizTiming'

interface QuestionTimerProps {
  /** Whole seconds left on the current question. */
  remaining: number
  /** The time every question gets, in seconds. */
  limit: number
}

/** Seconds left at which the timer switches to its "almost up" wording. */
export function isTimeLow(remaining: number, limit: number): boolean {
  return remaining <= Math.max(5, Math.ceil(limit * 0.2))
}

/**
 * The live countdown for the current question. It shows the clock, a bar that drains, and plain words once time is almost up,
 * so the warning never depends on color alone. The clock itself is not announced every second; screen readers hear only
 * the 30, 10 and 5 second marks.
 */
export function QuestionTimer({ remaining, limit }: QuestionTimerProps) {
  const low = isTimeLow(remaining, limit)
  const announcement = [30, 10, 5].includes(remaining) ? `${remaining} seconds left on this question.` : ''
  const Icon = low ? TriangleAlert : Hourglass
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-navy-900-12 bg-navy-50 p-3">
      <div role="timer" aria-label="Time left on this question" className="flex min-h-11 items-center gap-2 text-navy-900">
        <Icon size={20} aria-hidden="true" />
        <span className="font-mono text-2xl font-bold tabular-nums">{formatClock(remaining)}</span>
      </div>
      <progress aria-hidden="true" max={limit} value={remaining} className="h-3 min-w-32 flex-1 accent-navy-900" />
      <span className="text-sm font-semibold text-navy-900">{low ? 'Time is almost up' : 'left for this question'}</span>
      <span className="sr-only" role="status">{announcement}</span>
    </div>
  )
}
