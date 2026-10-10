export interface LevelProgress { level: number; xpIntoLevel: number; xpForNextLevel: number; xpToNextLevel: number }

/** Each level costs 100 more XP than the previous one. Level 1 starts at zero. */
export function xpThreshold(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level))
  return 50 * (safeLevel - 1) * safeLevel
}

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0))
  let level = 1
  while (safeXp >= xpThreshold(level + 1)) level += 1
  const start = xpThreshold(level)
  const next = xpThreshold(level + 1)
  return { level, xpIntoLevel: safeXp - start, xpForNextLevel: next - start, xpToNextLevel: next - safeXp }
}
