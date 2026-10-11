import type { GroupParticipation } from '../types'
import { GROUP_LIMITS } from '../types/group'

/** Pure helpers for the group part of the quiz settings form. No React, so they are easy to test. */

export const DEFAULT_GROUP_TIMER_SEC = 30

/** What a quiz switches to when the instructor picks "group": the simplest setup that works. */
export function defaultGroupParticipation(): GroupParticipation {
  return { type: 'group', groupSize: 3, answerMode: 'representative', teamFormation: 'assigned', waitForEveryone: false, questionTimeSec: null }
}

export interface GroupSettingsErrors {
  groupSize?: string
  questionTimeSec?: string
}

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

/** Messages shown next to the fields. A NaN (an empty or half-typed box) counts as invalid. */
export function groupSettingsErrors(participation: GroupParticipation): GroupSettingsErrors {
  const errors: GroupSettingsErrors = {}
  const size = participation.groupSize
  if (!isWhole(size) || size < GROUP_LIMITS.minTeamSize || size > GROUP_LIMITS.maxTeamSize) {
    errors.groupSize = `Enter a whole number from ${GROUP_LIMITS.minTeamSize} to ${GROUP_LIMITS.maxTeamSize}.`
  }
  const seconds = participation.questionTimeSec
  if (seconds !== null && (!isWhole(seconds) || seconds < GROUP_LIMITS.minQuestionTimeSec || seconds > GROUP_LIMITS.maxQuestionTimeSec)) {
    errors.questionTimeSec = `Enter a whole number of seconds from ${GROUP_LIMITS.minQuestionTimeSec} to ${GROUP_LIMITS.maxQuestionTimeSec}.`
  }
  return errors
}

/** First problem as one sentence, or null when the settings are fine. Used to block saving. */
export function firstGroupSettingsError(participation: GroupParticipation): string | null {
  const errors = groupSettingsErrors(participation)
  return errors.groupSize ?? errors.questionTimeSec ?? null
}

/** What "wait for everyone" means depends on who answers. */
export function waitHint(participation: GroupParticipation): string {
  const who = participation.answerMode === 'representative' ? 'the representative has answered' : 'every teammate has answered'
  return participation.questionTimeSec === null
    ? `The team stays on a question until ${who}.`
    : `The team moves on when ${who} or the timer ends, whichever comes first.`
}

/** One plain-language summary for the "How students will experience this quiz" card. */
export function describeGroupExperience(participation: GroupParticipation): string {
  const formation = participation.teamFormation === 'assigned' ? 'You build the teams from your class roster' : 'Students form their own teams with a team code'
  const answering = participation.answerMode === 'representative'
    ? 'One teammate, the representative, submits the team’s answer for each question while the others watch.'
    : 'Every teammate answers each question, then any one of them locks in the team’s final answer.'
  let pace = 'Teams move at their own pace.'
  if (participation.waitForEveryone && participation.questionTimeSec !== null) {
    pace = `A question moves on when ${participation.answerMode === 'representative' ? 'the representative has answered' : 'everyone has answered'} or after ${participation.questionTimeSec} seconds.`
  } else if (participation.waitForEveryone) {
    pace = participation.answerMode === 'representative' ? 'A team waits for its representative before moving on.' : 'A team waits for everyone before moving on.'
  } else if (participation.questionTimeSec !== null) {
    pace = `Each question closes after ${participation.questionTimeSec} seconds.`
  }
  return `${formation}, in teams of up to ${participation.groupSize}. ${answering} ${pace} Each team gets one shared score.`
}
