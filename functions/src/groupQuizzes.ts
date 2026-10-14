/** Entry point for the group quiz callables. index.ts wraps each handler in onCall. */
export { addTeamMember, createSelfTeam, createTeam, deleteTeam, joinTeam, leaveTeam, removeTeamMember, setRepresentative } from './groupQuizTeams.js'
export { advanceTeam, lockTeamAnswer, overrideTeamQuestion, startTeamAttempt, submitTeamAnswer } from './groupQuizPlay.js'
export { cleanupGroupQuizData, submitTeamAttempt } from './groupQuizFinish.js'
