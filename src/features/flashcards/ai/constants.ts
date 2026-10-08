/** Fewest and most cards one AI request may produce. Run it again for more. */
export const MIN_AI_CARDS = 1
export const MAX_AI_CARDS = 30
export const DEFAULT_AI_CARDS = 10
export const AI_COUNT_PRESETS = [5, 10, 15, 20, 30] as const

/** Characters of module text sent to the model. Keeps a request inside Groq's per-minute token budget. */
export const MAX_SOURCE_CHARS = 6000
export const MAX_EXTRA_NOTES_CHARS = 2000
export const MAX_SELECTED_MODULES = 5
/** Uploaded files per generation. Each shares the same request size budget as the modules. */
export const MAX_AI_DOCUMENTS = 3

/** Cards are asked to be shorter than the stored limits so they never get cut off. */
export const AI_FRONT_TARGET_CHARS = 160
export const AI_BACK_TARGET_CHARS = 320

export function clampAiCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AI_CARDS
  return Math.min(MAX_AI_CARDS, Math.max(MIN_AI_CARDS, Math.round(value)))
}
