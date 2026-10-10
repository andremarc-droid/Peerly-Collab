import type { GeneratedLessonPlan } from './generate'

/** A plain-language note about how a generation run ended, or an empty string when everything finished. */
export function describeLessonGeneration(
  generated: Pick<GeneratedLessonPlan, 'failureReason' | 'cancelled'>,
): string {
  if (generated.failureReason === 'rate-limit') {
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
