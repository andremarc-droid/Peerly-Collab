/**
 * Pure helpers for the instructor team management screen (no Firebase, no React).
 * The server still validates everything; these only keep the screen honest and give friendly messages early.
 */

export const TEAM_NAME_MAX = 40
export const MAX_TEAMS_PER_QUIZ = 100

export interface RosterStudent { uid: string; name: string }
export interface TeamLike { id: string; name: string; memberIds: string[]; representativeId: string; status: 'forming' | 'ready' | 'in_progress' | 'submitted' }
export interface TeamDraft { name: string; memberIds: string[]; representativeId: string }

/** Only active students can be put on a team. Pending and blocked students are left out. */
export function rosterFromEnrollments(enrollments: Array<{ uid: string; studentName: string; status: string }>): RosterStudent[] {
  const seen = new Set<string>()
  const roster: RosterStudent[] = []
  for (const item of enrollments) {
    if (item.status !== 'active' || seen.has(item.uid)) continue
    seen.add(item.uid)
    roster.push({ uid: item.uid, name: item.studentName.trim() || 'Student' })
  }
  return roster.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid))
}

/** Roster students who are not on any team yet. */
export function unassignedStudents(roster: RosterStudent[], teams: Array<Pick<TeamLike, 'memberIds'>>): RosterStudent[] {
  const taken = new Set(teams.flatMap(team => team.memberIds))
  return roster.filter(student => !taken.has(student.uid))
}

/** Teams are editable until they start playing. */
export const isTeamEditable = (status: TeamLike['status']): boolean => status === 'forming' || status === 'ready'

export function teamStatusLabel(status: TeamLike['status']): string {
  if (status === 'forming') return 'Forming'
  if (status === 'ready') return 'Ready'
  if (status === 'in_progress') return 'Playing now'
  return 'Submitted'
}

/** One short sentence that tells the instructor what a team still needs. */
export function teamHint(team: TeamLike, groupSize: number): string {
  if (team.status === 'in_progress') return 'Playing now. Members can no longer be changed.'
  if (team.status === 'submitted') return 'Submitted. This team is finished.'
  if (team.memberIds.length < 2) return 'Needs at least 2 members to start (you can still force a start).'
  if (team.memberIds.length >= groupSize) return `Full (${groupSize} of ${groupSize}).`
  return `${team.memberIds.length} of ${groupSize} members. Room for ${groupSize - team.memberIds.length} more.`
}

export function validateTeamDraft(draft: TeamDraft, groupSize: number): string | null {
  const name = draft.name.trim()
  if (name.length === 0) return 'Give the team a name.'
  if (name.length > TEAM_NAME_MAX) return `Team names can have at most ${TEAM_NAME_MAX} characters.`
  if (draft.memberIds.length < 1) return 'Pick at least one student.'
  if (draft.memberIds.length > groupSize) return `Teams in this quiz have at most ${groupSize} members.`
  if (new Set(draft.memberIds).size !== draft.memberIds.length) return 'A student is listed twice.'
  if (!draft.memberIds.includes(draft.representativeId)) return 'Choose a representative from the team members.'
  return null
}

/** True when a name is already used by another team (case-insensitive). Duplicate names are allowed but confusing, so we warn. */
export function isDuplicateTeamName(name: string, teams: Array<Pick<TeamLike, 'name'>>): boolean {
  const wanted = name.trim().toLowerCase()
  return wanted.length > 0 && teams.some(team => team.name.trim().toLowerCase() === wanted)
}

/** Splits n students into the fewest teams that fit, with sizes that differ by at most one, so nobody is left alone. */
export function balancedTeamSizes(studentCount: number, groupSize: number): number[] {
  if (studentCount <= 0 || groupSize < 1) return []
  const teamCount = Math.ceil(studentCount / groupSize)
  const base = Math.floor(studentCount / teamCount)
  const extra = studentCount % teamCount
  return Array.from({ length: teamCount }, (_, index) => base + (index < extra ? 1 : 0))
}

/** Fisher-Yates shuffle that never changes its input. `random` returns a number in [0, 1). */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

/**
 * Random, balanced team drafts for the students who are not on a team yet. Names continue after the existing teams
 * ("Team 4", "Team 5", ...) and skip any name that is already taken. The first member of each draft is the representative.
 * Returns fewer drafts when the 100-team cap would be reached.
 */
export function autoAssignDrafts(students: RosterStudent[], groupSize: number, existingTeams: Array<Pick<TeamLike, 'name'>>, random: () => number = Math.random): TeamDraft[] {
  const room = Math.max(0, MAX_TEAMS_PER_QUIZ - existingTeams.length)
  const sizes = balancedTeamSizes(students.length, groupSize).slice(0, room)
  const taken = new Set(existingTeams.map(team => team.name.trim().toLowerCase()))
  const pool = shuffled(students, random)
  let number = existingTeams.length
  let cursor = 0
  return sizes.map(size => {
    let name = ''
    do { number += 1; name = `Team ${number}` } while (taken.has(name.toLowerCase()))
    taken.add(name.toLowerCase())
    const memberIds = pool.slice(cursor, cursor + size).map(student => student.uid)
    cursor += size
    return { name, memberIds, representativeId: memberIds[0] }
  })
}

/** Plain-language names for the roster: falls back to a short id when a member left the class. */
export function memberLabel(uid: string, names: Record<string, string>, roster: RosterStudent[]): string {
  return names[uid] || roster.find(student => student.uid === uid)?.name || `Student ${uid.slice(0, 6)}`
}
