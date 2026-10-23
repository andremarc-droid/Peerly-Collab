import type { LearningCanvasWithId } from './types'

export type LearningTab =
  | 'home'
  | 'decks'
  | 'lessons'
  | 'notes'
  | 'canvases'
  | 'publicDecks'
  | 'studyGroups'
  | 'scoreboard'

/** Keeps the old Learning query values usable while normalizing the new tabs. */
export function resolveLearningTab(value: string | null): LearningTab {
  if (value === 'flashcards' || value === 'decks') return 'decks'
  if (value === 'notes') return 'notes'
  if (value === 'canvases' || value === 'canvas' || value === 'graph') return 'canvases'
  if (value === 'lessons') return 'lessons'
  if (value === 'publicDecks' || value === 'public-decks' || value === 'public') return 'publicDecks'
  if (value === 'studyGroups' || value === 'study-groups' || value === 'groups') return 'studyGroups'
  if (value === 'scoreboard' || value === 'scores' || value === 'leaderboard') return 'scoreboard'
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
