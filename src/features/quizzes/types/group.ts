import type { AnswerMode, TeamFormation } from './index'

/** Group quiz settings, kept in one place so the parser, the editor and the Cloud Functions agree on limits. */
export const GROUP_LIMITS = {
  minTeamSize: 2,
  maxTeamSize: 10,
  minQuestionTimeSec: 10,
  maxQuestionTimeSec: 300,
  maxTeamsPerQuiz: 100,
  teamNameMax: 40,
  teamCodeLength: 6,
} as const

export const ANSWER_MODES: readonly AnswerMode[] = ['representative', 'everyone']
export const TEAM_FORMATIONS: readonly TeamFormation[] = ['assigned', 'self']
