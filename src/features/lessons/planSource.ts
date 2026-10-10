/**
 * The most source text kept with a lesson plan, so "Regenerate lessons" can use the learner's own material again.
 * Matches the Create flow's source cap and the size check in `firestore.rules` (`lessonPlans/{planId}/source/main`).
 */
export const MAX_PLAN_SOURCE_CHARS = 60_000

/** Trims and caps source text for storage, never leaving half of an emoji or other surrogate pair at the cut. */
export function clampPlanSource(text: string | undefined): string {
  const clipped = (text ?? '').trim().slice(0, MAX_PLAN_SOURCE_CHARS)
  const last = clipped.charCodeAt(clipped.length - 1)
  const endsInHighSurrogate = last >= 0xd800 && last <= 0xdbff
  return endsInHighSurrogate ? clipped.slice(0, -1) : clipped
}
