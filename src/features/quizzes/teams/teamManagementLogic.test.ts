import { describe, expect, it } from 'vitest'
import {
  MAX_TEAMS_PER_QUIZ, autoAssignDrafts, balancedTeamSizes, isDuplicateTeamName, isTeamEditable, memberLabel, rosterFromEnrollments,
  shuffled, teamHint, teamStatusLabel, unassignedStudents, validateTeamDraft, type RosterStudent, type TeamLike,
} from './teamManagementLogic'

const student = (uid: string, name = uid): RosterStudent => ({ uid, name })
const team = (overrides: Partial<TeamLike> = {}): TeamLike => ({ id: 't1', name: 'Team 1', memberIds: ['a', 'b'], representativeId: 'a', status: 'ready', ...overrides })
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

describe('rosterFromEnrollments', () => {
  it('keeps only active students, sorted by name, without duplicates', () => {
    const roster = rosterFromEnrollments([
      { uid: 'c', studentName: 'Zed', status: 'active' },
      { uid: 'a', studentName: 'Amy', status: 'active' },
      { uid: 'p', studentName: 'Pending', status: 'pending' },
      { uid: 'b', studentName: 'Blocked', status: 'blocked' },
      { uid: 'a', studentName: 'Amy again', status: 'active' },
    ])
    expect(roster).toEqual([{ uid: 'a', name: 'Amy' }, { uid: 'c', name: 'Zed' }])
  })
  it('falls back to "Student" for a blank name', () => {
    expect(rosterFromEnrollments([{ uid: 'a', studentName: '   ', status: 'active' }])).toEqual([{ uid: 'a', name: 'Student' }])
  })
  it('returns an empty list for an empty class', () => { expect(rosterFromEnrollments([])).toEqual([]) })
})

describe('unassignedStudents', () => {
  it('removes everyone who is on any team', () => {
    expect(unassignedStudents([student('a'), student('b'), student('c')], [{ memberIds: ['a'] }, { memberIds: ['c'] }])).toEqual([student('b')])
  })
  it('returns everyone when there are no teams', () => { expect(unassignedStudents([student('a')], [])).toEqual([student('a')]) })
})

describe('team status helpers', () => {
  it('only forming and ready teams can be edited', () => {
    expect(isTeamEditable('forming')).toBe(true)
    expect(isTeamEditable('ready')).toBe(true)
    expect(isTeamEditable('in_progress')).toBe(false)
    expect(isTeamEditable('submitted')).toBe(false)
  })
  it('labels every status', () => {
    expect(teamStatusLabel('forming')).toBe('Forming')
    expect(teamStatusLabel('ready')).toBe('Ready')
    expect(teamStatusLabel('in_progress')).toBe('Playing now')
    expect(teamStatusLabel('submitted')).toBe('Submitted')
  })
  it('explains what a team still needs', () => {
    expect(teamHint(team({ memberIds: ['a'], status: 'forming' }), 4)).toMatch(/at least 2/)
    expect(teamHint(team({ memberIds: ['a', 'b', 'c', 'd'] }), 4)).toBe('Full (4 of 4).')
    expect(teamHint(team({ memberIds: ['a', 'b'] }), 4)).toBe('2 of 4 members. Room for 2 more.')
    expect(teamHint(team({ status: 'in_progress' }), 4)).toMatch(/Playing now/)
    expect(teamHint(team({ status: 'submitted' }), 4)).toMatch(/Submitted/)
  })
})

describe('validateTeamDraft', () => {
  const ok = { name: 'Owls', memberIds: ['a', 'b'], representativeId: 'a' }
  it('accepts a good draft', () => { expect(validateTeamDraft(ok, 3)).toBeNull() })
  it('rejects a blank or too long name', () => {
    expect(validateTeamDraft({ ...ok, name: '   ' }, 3)).toMatch(/name/)
    expect(validateTeamDraft({ ...ok, name: 'x'.repeat(41) }, 3)).toMatch(/40/)
    expect(validateTeamDraft({ ...ok, name: 'x'.repeat(40) }, 3)).toBeNull()
  })
  it('rejects empty, oversized and duplicated member lists', () => {
    expect(validateTeamDraft({ ...ok, memberIds: [] }, 3)).toMatch(/at least one/)
    expect(validateTeamDraft({ ...ok, memberIds: ['a', 'b', 'c', 'd'] }, 3)).toMatch(/at most 3/)
    expect(validateTeamDraft({ ...ok, memberIds: ['a', 'a'] }, 3)).toMatch(/twice/)
  })
  it('requires the representative to be a member', () => { expect(validateTeamDraft({ ...ok, representativeId: 'z' }, 3)).toMatch(/representative/) })
})

describe('isDuplicateTeamName', () => {
  it('compares case-insensitively and ignores blanks', () => {
    expect(isDuplicateTeamName(' owls ', [{ name: 'Owls' }])).toBe(true)
    expect(isDuplicateTeamName('Hawks', [{ name: 'Owls' }])).toBe(false)
    expect(isDuplicateTeamName('   ', [{ name: '' }])).toBe(false)
  })
})

describe('balancedTeamSizes', () => {
  it('never leaves a team alone when it can be avoided', () => {
    expect(balancedTeamSizes(7, 3)).toEqual([3, 2, 2])
    expect(balancedTeamSizes(10, 4)).toEqual([4, 3, 3])
    expect(balancedTeamSizes(6, 3)).toEqual([3, 3])
  })
  it('handles tiny and invalid input', () => {
    expect(balancedTeamSizes(1, 3)).toEqual([1])
    expect(balancedTeamSizes(0, 3)).toEqual([])
    expect(balancedTeamSizes(5, 0)).toEqual([])
  })
  it('always adds up and respects the size', () => {
    for (let count = 1; count <= 60; count += 1) for (let size = 2; size <= 10; size += 1) {
      const sizes = balancedTeamSizes(count, size)
      expect(sizes.reduce((sum, item) => sum + item, 0)).toBe(count)
      expect(Math.max(...sizes)).toBeLessThanOrEqual(size)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })
})

describe('shuffled', () => {
  it('keeps every item and does not change the input', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffled(input, seeded(7))
    expect([...output].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
  })
})

describe('autoAssignDrafts', () => {
  const roster = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => student(id))
  it('puts every student on exactly one valid team', () => {
    const drafts = autoAssignDrafts(roster, 3, [], seeded(3))
    expect(drafts.map(item => item.memberIds.length)).toEqual([3, 2, 2])
    expect(drafts.flatMap(item => item.memberIds).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    for (const draft of drafts) expect(validateTeamDraft(draft, 3)).toBeNull()
  })
  it('numbers teams after the existing ones and skips taken names', () => {
    const drafts = autoAssignDrafts(roster, 4, [{ name: 'Team 1' }, { name: 'team 3' }], seeded(1))
    expect(drafts.map(item => item.name)).toEqual(['Team 4', 'Team 5'])
  })
  it('makes the first member the representative', () => {
    for (const draft of autoAssignDrafts(roster, 3, [], seeded(9))) expect(draft.representativeId).toBe(draft.memberIds[0])
  })
  it('returns nothing for nobody and respects the team cap', () => {
    expect(autoAssignDrafts([], 3, [])).toEqual([])
    const existing = Array.from({ length: MAX_TEAMS_PER_QUIZ - 1 }, (_, index) => ({ name: `Group ${index}` }))
    expect(autoAssignDrafts(roster, 3, existing, seeded(2))).toHaveLength(1)
    expect(autoAssignDrafts(roster, 3, [...existing, { name: 'Last' }])).toEqual([])
  })
  it('does not change the roster it was given', () => {
    const copy = roster.map(item => ({ ...item }))
    autoAssignDrafts(roster, 3, [], seeded(5))
    expect(roster).toEqual(copy)
  })
})

describe('memberLabel', () => {
  it('prefers the name stored on the team, then the roster, then a short id', () => {
    expect(memberLabel('a', { a: 'Team copy' }, [student('a', 'Roster')])).toBe('Team copy')
    expect(memberLabel('a', {}, [student('a', 'Roster')])).toBe('Roster')
    expect(memberLabel('abcdefghij', {}, [])).toBe('Student abcdef')
  })
})
