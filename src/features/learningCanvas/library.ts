import type { LearningCanvasWithId } from './types'

export type LearningTab = 'home' | 'decks' | 'lessons' | 'notes' | 'canvases' | 'groups' | 'games'

/** Keeps the old Learning query values usable while normalizing the new tabs. */
export function resolveLearningTab(value: string | null): LearningTab {
  if (value === 'flashcards' || value === 'decks') return 'decks'
  if (value === 'notes') return 'notes'
  if (value === 'canvases' || value === 'canvas' || value === 'graph') return 'canvases'
  if (value === 'lessons' || value === 'groups' || value === 'games') return value
  return 'home'
}

/** Deduplicates owned and individually shared study canvases, newest first. */
export function aggregateLearningLibrary(
  owned: LearningCanvasWithId[],
  shared: LearningCanvasWithId[],
): LearningCanvasWithId[] {
  const items = new Map<string, LearningCanvasWithId>()
  for (const item of [...owned, ...shared]) items.set(`${item.classId}/${item.id}`, item)
  return [...items.values()].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
}
