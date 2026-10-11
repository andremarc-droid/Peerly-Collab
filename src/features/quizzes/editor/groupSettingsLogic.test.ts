import { describe, expect, it } from 'vitest'
import type { GroupParticipation } from '../types'
import { defaultGroupParticipation, describeGroupExperience, firstGroupSettingsError, groupSettingsErrors, waitHint } from './groupSettingsLogic'

const base = (patch: Partial<GroupParticipation> = {}): GroupParticipation => ({ ...defaultGroupParticipation(), ...patch })

describe('defaultGroupParticipation', () => {
  it('starts with a valid, simple setup', () => {
    expect(defaultGroupParticipation()).toEqual({ type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null })
    expect(groupSettingsErrors(defaultGroupParticipation())).toEqual({})
  })
  it('returns a fresh object each time', () => {
    expect(defaultGroupParticipation()).not.toBe(defaultGroupParticipation())
  })
})

describe('groupSettingsErrors', () => {
  it.each([2, 3, 10])('accepts a team size of %i', size => {
    expect(groupSettingsErrors(base({ groupSize: size })).groupSize).toBeUndefined()
  })
  it.each([[1], [11], [0], [-3], [2.5], [Number.NaN]])('rejects a team size of %s', size => {
    expect(groupSettingsErrors(base({ groupSize: size })).groupSize).toMatch(/2 to 10/)
  })
  it('accepts no timer and timers inside 10-300 seconds', () => {
    for (const seconds of [null, 10, 30, 300]) expect(groupSettingsErrors(base({ questionTimeSec: seconds })).questionTimeSec).toBeUndefined()
  })
  it.each([[9], [301], [0], [15.5], [Number.NaN]])('rejects a timer of %s seconds', seconds => {
    expect(groupSettingsErrors(base({ questionTimeSec: seconds })).questionTimeSec).toMatch(/10 to 300/)
  })
  it('reports both problems at once', () => {
    expect(Object.keys(groupSettingsErrors(base({ groupSize: 1, questionTimeSec: 5 }))).sort()).toEqual(['groupSize', 'questionTimeSec'])
  })
})

describe('firstGroupSettingsError', () => {
  it('is null for valid settings and names the team size problem first', () => {
    expect(firstGroupSettingsError(base())).toBeNull()
    expect(firstGroupSettingsError(base({ groupSize: 20, questionTimeSec: 5 }))).toMatch(/2 to 10/)
    expect(firstGroupSettingsError(base({ questionTimeSec: 5 }))).toMatch(/10 to 300/)
  })
})

describe('waitHint', () => {
  it('names the representative in representative mode and everyone in everyone mode', () => {
    expect(waitHint(base({ answerMode: 'representative' }))).toMatch(/representative/)
    expect(waitHint(base({ answerMode: 'everyone' }))).toMatch(/every teammate/)
  })
  it('explains that a timer can end the wait', () => {
    expect(waitHint(base({ questionTimeSec: 30 }))).toMatch(/timer ends/)
    expect(waitHint(base({ questionTimeSec: null }))).not.toMatch(/timer/)
  })
})

describe('describeGroupExperience', () => {
  it('describes assigned teams, representative mode and free pace', () => {
    const text = describeGroupExperience(base({ groupSize: 4 }))
    expect(text).toMatch(/You build the teams/)
    expect(text).toMatch(/up to 4/)
    expect(text).toMatch(/representative/)
    expect(text).toMatch(/own pace/)
    expect(text).toMatch(/one shared score/)
  })
  it('describes self-formed teams and everyone mode', () => {
    const text = describeGroupExperience(base({ teamFormation: 'self', answerMode: 'everyone' }))
    expect(text).toMatch(/team code/)
    expect(text).toMatch(/locks in/)
  })
  it('covers wait only, timer only and wait plus timer', () => {
    expect(describeGroupExperience(base({ waitForEveryone: true }))).toMatch(/waits for its representative/)
    expect(describeGroupExperience(base({ waitForEveryone: true, answerMode: 'everyone' }))).toMatch(/waits for everyone/)
    expect(describeGroupExperience(base({ questionTimeSec: 45 }))).toMatch(/closes after 45 seconds/)
    expect(describeGroupExperience(base({ waitForEveryone: true, questionTimeSec: 45, answerMode: 'everyone' }))).toMatch(/everyone has answered or after 45 seconds/)
  })
})
