import type { GeneratedLessonPlan } from './generate'

/** "in about 45 seconds", "in about 3 minutes", "in about 2 hours". */
export function formatWait(seconds: number): string {
  if (seconds < 90) return `in about ${Math.max(1, Math.round(seconds))} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 120 ? `in about ${minutes} minutes` : `in about ${Math.ceil(minutes / 60)} hours`
}

/** A plain-language note about how a generation run ended, or an empty string when everything finished. */
export function describeLessonGeneration(
  generated: Pick<GeneratedLessonPlan, 'failureReason' | 'cancelled' | 'retryAfterSeconds'>,
): string {
  if (generated.failureReason === 'rate-limit') {
    if (generated.retryAfterSeconds) return `The AI is rate-limited. Your completed lessons are saved; retry the remaining lessons ${formatWait(generated.retryAfterSeconds)}.`
    return 'The AI is rate-limited. Your completed lessons are saved; retry the remaining lessons later.'
  }
  if (generated.failureReason) {
    return 'The AI could not validate a later lesson. Completed lessons are saved; retry the remaining lessons.'
  }
  if (generated.cancelled) {
    return 'Generation was stopped. Completed lessons are saved as a partial plan.'
  }
  return ''
}
