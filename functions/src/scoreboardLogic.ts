/**
 * Shared scoreboard pure business logic.
 * Keep in sync with src/features/scoreboard/schemas.ts.
 */

export interface ScoreboardUserFields {
  scoreboardOptIn?: boolean | null
  role?: string | null
  age?: number | null
  scoreboardDisplayName?: string | null
  displayName?: string | null
  name?: string | null
  avatar?: string | null
  photoURL?: string | null
}

/**
 * Single source of truth for scoreboard opt-in resolution:
 * 1. Explicit `scoreboardOptIn` on user document always wins.
 * 2. If undefined or null, students under 18 default to OFF (false).
 * 3. All other users (adult students, instructors, unassigned) default to ON (true).
 */
export function resolveScoreboardOptIn(user: ScoreboardUserFields | null | undefined): boolean {
  if (!user) return true
  if (typeof user.scoreboardOptIn === 'boolean') {
    return user.scoreboardOptIn
  }
  if (user.role === 'student' && typeof user.age === 'number' && user.age < 18) {
    return false
  }
  return true
}

/**
 * Resolves safe display name in order:
 * scoreboardDisplayName -> displayName -> name -> 'Peerly Learner'
 */
export function resolveDisplayName(user: ScoreboardUserFields | null | undefined): string {
  const custom = user?.scoreboardDisplayName?.trim()
  if (custom && custom.length > 0) return custom.slice(0, 40)

  const display = user?.displayName?.trim()
  if (display && display.length > 0) return display.slice(0, 40)

  const name = user?.name?.trim()
  if (name && name.length > 0) return name.slice(0, 40)

  return 'Peerly Learner'
}

/**
 * Resolves avatar in order: avatar -> photoURL -> null
 */
export function resolveAvatar(user: ScoreboardUserFields | null | undefined): string | null {
  return user?.avatar || user?.photoURL || null
}

/**
 * Daily cap for server-side scoreboard XP progression.
 * Chosen at 500 XP to allow honest, intensive daily study (equivalent to ~25 lessons
 * or 10 perfect quizzes) while bounding runaway scripts and duplicate syncs.
 */
export const DAILY_SCOREBOARD_CAP = 500

/**
 * Computes how many points of a delta can be awarded given current daily total and cap.
 */
export function calculateCappedDelta(currentTotal: number, delta: number, cap = DAILY_SCOREBOARD_CAP): number {
  if (delta <= 0) return 0
  if (currentTotal >= cap) return 0
  return Math.max(0, Math.min(delta, cap - currentTotal))
}

/** Formats UTC date string YYYY-MM-DD for daily logs. */
export function getTodayKeyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

const RESERVED_NAMES = new Set(['admin', 'administrator', 'peerly', 'moderator', 'system', 'root', 'staff'])

const PROFANITY_PATTERN = /(fuck|shit|bitch|asshole|cunt|nigger|faggot|dick|pussy|bastard)/i

/**
 * Validates scoreboard display name on the server.
 * Keep in sync with src/features/scoreboard/schemas.ts.
 */
export function validateScoreboardDisplayName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (trimmed.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters.' }
  }
  if (trimmed.length > 30) {
    return { valid: false, error: 'Display name must be 30 characters or less.' }
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
    return { valid: false, error: 'This display name is reserved. Please choose another.' }
  }
  if (PROFANITY_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Display name contains inappropriate language.' }
  }
  return { valid: true }
}

