import { FieldValue } from 'firebase-admin/firestore'
import type { CallableRequest } from 'firebase-functions/v2/https'
import {
  GROUP_LIMITS, GroupQuizError, assertCanJoin, generateTeamCode, representativeAfterLeave, statusForMemberCount, withoutMember,
} from './groupQuizLogic.js'
import {
  parseCreateAssignedTeam, parseCreateSelfTeam, parseJoinTeam, parseRemoveMember, parseSetRepresentative, parseTeamRef,
} from './groupQuizRequests.js'
import {
  RATE, assertActiveStudents, assertOwner, assertPlayable, authedUid, codeRef, db, displayNames, enforceRate, guarded, membershipRef,
  metaRef, privateRef, quizRef, readQuiz, readTeam, sessionRef, studyGroupMemberRef, teamRef, teamsCollection,
  type QuizInfo, type TeamData,
} from './groupQuizData.js'

/** Team formation and membership. Clients never write these documents; every change goes through here. */

class CodeCollision extends Error {}

const teamCountOf = (meta: FirebaseFirestore.DocumentSnapshot): number => {
  const value = meta.get('teamCount')
  return typeof value === 'number' && value > 0 ? value : 0
}

function assertSelfFormation(quiz: QuizInfo): void {
  if (quiz.settings.teamFormation !== 'self') throw new GroupQuizError('Your instructor builds the teams for this quiz.', 'failed-precondition')
}
function assertNotStarted(team: TeamData): void {
  if (team.status !== 'forming' && team.status !== 'ready') throw new GroupQuizError('This team already started the quiz.', 'failed-precondition')
}

/** Removes the session and private answers of a team after its document was deleted. */
export async function purgeTeamData(quizId: string, teamId: string): Promise<void> {
  await db().recursiveDelete(sessionRef(quizId, teamId))
  await privateRef(quizId, teamId).delete()
}

// ---- instructor builds a team ---------------------------------------------------------------------------------

export async function createTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseCreateAssignedTeam(call.data)
    await enforceRate(uid, 'teamChange', RATE.teamChange)
    const team = teamsCollection(request.quizId).doc()
    await db().runTransaction(async tx => {
      const [quizSnap, metaSnap] = await Promise.all([tx.get(quizRef(request.quizId)), tx.get(metaRef(request.quizId))])
      const quiz = readQuiz(quizSnap)
      assertOwner(quiz, uid)
      if (quiz.status === 'archived') throw new GroupQuizError('This quiz is archived.', 'failed-precondition')
      if (quiz.settings.teamFormation !== 'assigned') throw new GroupQuizError('Students form their own teams in this quiz.', 'failed-precondition')
      if (request.memberIds.length > quiz.settings.groupSize) throw new GroupQuizError(`Teams in this quiz have at most ${quiz.settings.groupSize} members.`)
      const count = teamCountOf(metaSnap)
      if (count >= GROUP_LIMITS.maxTeamsPerQuiz) throw new GroupQuizError(`A quiz can have at most ${GROUP_LIMITS.maxTeamsPerQuiz} teams.`, 'resource-exhausted')
      await assertActiveStudents(tx, quiz.classId, request.memberIds)
      const [existing, names] = await Promise.all([Promise.all(request.memberIds.map(id => tx.get(membershipRef(id, request.quizId)))), displayNames(tx, request.memberIds)])
      if (existing.some(snap => snap.exists)) throw new GroupQuizError('A student is already on a team for this quiz.', 'already-exists')
      const now = FieldValue.serverTimestamp()
      tx.create(team, {
        name: request.name, memberIds: request.memberIds, memberNames: names, representativeId: request.representativeId, code: null, studyGroupId: null,
        status: statusForMemberCount(request.memberIds.length), createdBy: uid, createdAt: now, updatedAt: now,
      })
      for (const id of request.memberIds) tx.set(membershipRef(id, request.quizId), { quizId: request.quizId, teamId: team.id, joinedAt: now })
      tx.set(metaRef(request.quizId), { teamCount: count + 1 }, { merge: true })
    })
    return { teamId: team.id }
  })
}

export async function addTeamMember(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseSetRepresentative(call.data)
    await enforceRate(uid, 'teamChange', RATE.teamChange)
    await db().runTransaction(async tx => {
      const [quizSnap, teamSnap, membership] = await Promise.all([tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, request.teamId)), tx.get(membershipRef(request.memberId, request.quizId))])
      const quiz = readQuiz(quizSnap)
      assertOwner(quiz, uid)
      const team = readTeam(teamSnap)
      assertCanJoin({ memberCount: team.memberIds.length, groupSize: quiz.settings.groupSize, status: team.status })
      if (membership.exists || team.memberIds.includes(request.memberId)) throw new GroupQuizError('That student is already on a team for this quiz.', 'already-exists')
      await assertActiveStudents(tx, quiz.classId, [request.memberId])
      const names = await displayNames(tx, [request.memberId])
      const memberIds = [...team.memberIds, request.memberId]
      tx.update(teamRef(request.quizId, request.teamId), { memberIds, memberNames: { ...team.memberNames, ...names }, status: statusForMemberCount(memberIds.length), updatedAt: FieldValue.serverTimestamp() })
      tx.set(membershipRef(request.memberId, request.quizId), { quizId: request.quizId, teamId: request.teamId, joinedAt: FieldValue.serverTimestamp() })
    })
    return { ok: true }
  })
}

// ---- students form a team -------------------------------------------------------------------------------------

export async function createSelfTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseCreateSelfTeam(call.data)
    await enforceRate(uid, 'teamChange', RATE.teamChange)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateTeamCode()
      const team = teamsCollection(request.quizId).doc()
      try {
        await db().runTransaction(async tx => {
          const [quizSnap, metaSnap, membership, codeSnap, groupMember] = await Promise.all([
            tx.get(quizRef(request.quizId)), tx.get(metaRef(request.quizId)), tx.get(membershipRef(uid, request.quizId)), tx.get(codeRef(request.quizId, code)),
            request.studyGroupId ? tx.get(studyGroupMemberRef(request.studyGroupId, uid)) : Promise.resolve(null),
          ])
          const quiz = readQuiz(quizSnap)
          assertPlayable(quiz)
          assertSelfFormation(quiz)
          if (codeSnap.exists) throw new CodeCollision()
          if (membership.exists) throw new GroupQuizError('You are already on a team for this quiz.', 'already-exists')
          if (request.studyGroupId && !groupMember?.exists) throw new GroupQuizError('You are not a member of that study group.', 'permission-denied')
          const count = teamCountOf(metaSnap)
          if (count >= GROUP_LIMITS.maxTeamsPerQuiz) throw new GroupQuizError(`A quiz can have at most ${GROUP_LIMITS.maxTeamsPerQuiz} teams.`, 'resource-exhausted')
          await assertActiveStudents(tx, quiz.classId, [uid])
          const names = await displayNames(tx, [uid])
          const now = FieldValue.serverTimestamp()
          tx.create(team, { name: request.name, memberIds: [uid], memberNames: names, representativeId: uid, code, studyGroupId: request.studyGroupId, status: 'forming', createdBy: uid, createdAt: now, updatedAt: now })
          tx.create(codeRef(request.quizId, code), { teamId: team.id })
          tx.set(membershipRef(uid, request.quizId), { quizId: request.quizId, teamId: team.id, joinedAt: now })
          tx.set(metaRef(request.quizId), { teamCount: count + 1 }, { merge: true })
        })
        return { teamId: team.id, code }
      } catch (error) {
        if (error instanceof CodeCollision) continue
        throw error
      }
    }
    throw new GroupQuizError('Could not make a unique team code. Please try again.', 'resource-exhausted')
  })
}

export async function joinTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseJoinTeam(call.data)
    await enforceRate(uid, 'teamChange', RATE.teamChange)
    const codeSnap = await codeRef(request.quizId, request.code).get()
    const teamId = codeSnap.get('teamId')
    if (!codeSnap.exists || typeof teamId !== 'string') throw new GroupQuizError('That team code was not found.', 'not-found')
    await db().runTransaction(async tx => {
      const [quizSnap, teamSnap, membership] = await Promise.all([tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, teamId)), tx.get(membershipRef(uid, request.quizId))])
      const quiz = readQuiz(quizSnap)
      assertPlayable(quiz)
      assertSelfFormation(quiz)
      const team = readTeam(teamSnap)
      if (team.code !== request.code) throw new GroupQuizError('That team code was not found.', 'not-found')
      if (membership.exists) throw new GroupQuizError('You are already on a team for this quiz.', 'already-exists')
      assertCanJoin({ memberCount: team.memberIds.length, groupSize: quiz.settings.groupSize, status: team.status })
      if (team.studyGroupId && !(await tx.get(studyGroupMemberRef(team.studyGroupId, uid))).exists) throw new GroupQuizError('This team is only for members of its study group.', 'permission-denied')
      await assertActiveStudents(tx, quiz.classId, [uid])
      const names = await displayNames(tx, [uid])
      const memberIds = [...team.memberIds, uid]
      tx.update(teamRef(request.quizId, teamId), { memberIds, memberNames: { ...team.memberNames, ...names }, status: statusForMemberCount(memberIds.length), updatedAt: FieldValue.serverTimestamp() })
      tx.set(membershipRef(uid, request.quizId), { quizId: request.quizId, teamId, joinedAt: FieldValue.serverTimestamp() })
    })
    return { teamId }
  })
}

// ---- leaving and removing ---------------------------------------------------------------------------------------

/**
 * Takes one member off a team in a single transaction. `authorize` decides whether the caller may do this. When the team becomes
 * empty it is deleted. The quiz may already be gone (account cleanup), in which case `quiz` is null.
 */
export async function removeFromTeam(quizId: string, teamId: string, targetUid: string, authorize: (team: TeamData, quiz: QuizInfo | null) => void): Promise<{ deleted: boolean }> {
  const deleted = await db().runTransaction(async tx => {
    const [quizSnap, teamSnap, metaSnap] = await Promise.all([tx.get(quizRef(quizId)), tx.get(teamRef(quizId, teamId)), tx.get(metaRef(quizId))])
    const team = readTeam(teamSnap)
    const quiz = quizSnap.exists ? readQuiz(quizSnap) : null
    authorize(team, quiz)
    if (!team.memberIds.includes(targetUid)) throw new GroupQuizError('That person is not on this team.', 'not-found')
    const remaining = withoutMember(team.memberIds, targetUid)
    tx.delete(membershipRef(targetUid, quizId))
    if (remaining.length === 0) {
      tx.delete(teamRef(quizId, teamId))
      if (team.code) tx.delete(codeRef(quizId, team.code))
      tx.set(metaRef(quizId), { teamCount: Math.max(0, teamCountOf(metaSnap) - 1) }, { merge: true })
      return true
    }
    const names = { ...team.memberNames }
    delete names[targetUid]
    const notStarted = team.status === 'forming' || team.status === 'ready'
    tx.update(teamRef(quizId, teamId), {
      memberIds: remaining, memberNames: names, representativeId: representativeAfterLeave(team.memberIds, team.representativeId, targetUid) ?? remaining[0],
      status: notStarted ? statusForMemberCount(remaining.length) : team.status, updatedAt: FieldValue.serverTimestamp(),
    })
    return false
  })
  if (deleted) await purgeTeamData(quizId, teamId)
  return { deleted }
}

export async function leaveTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseTeamRef(call.data)
    await enforceRate(uid, 'teamChange', RATE.teamChange)
    return removeFromTeam(request.quizId, request.teamId, uid, team => {
      if (team.code === null) throw new GroupQuizError('Your instructor built this team, so ask them to change it.', 'permission-denied')
      assertNotStarted(team)
    })
  })
}

export async function removeTeamMember(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseRemoveMember(call.data)
    await enforceRate(uid, 'manage', RATE.manage)
    return removeFromTeam(request.quizId, request.teamId, request.memberId, (_team, quiz) => {
      if (!quiz) throw new GroupQuizError('This quiz no longer exists.', 'not-found')
      assertOwner(quiz, uid)
    })
  })
}

export async function setRepresentative(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseSetRepresentative(call.data)
    await enforceRate(uid, 'manage', RATE.manage)
    await db().runTransaction(async tx => {
      const [quizSnap, teamSnap] = await Promise.all([tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, request.teamId))])
      const quiz = readQuiz(quizSnap)
      const team = readTeam(teamSnap)
      const isOwner = quiz.ownerId === uid
      if (!isOwner) {
        if (!team.memberIds.includes(uid)) throw new GroupQuizError('You are not on this team.', 'permission-denied')
        if (quiz.settings.teamFormation !== 'self') throw new GroupQuizError('Only your instructor can change the representative.', 'permission-denied')
        assertNotStarted(team)
      }
      if (team.status === 'submitted') throw new GroupQuizError('This team already submitted the quiz.', 'failed-precondition')
      if (!team.memberIds.includes(request.memberId)) throw new GroupQuizError('The representative must be a team member.')
      tx.update(teamRef(request.quizId, request.teamId), { representativeId: request.memberId, updatedAt: FieldValue.serverTimestamp() })
    })
    return { ok: true }
  })
}

export async function deleteTeam(call: CallableRequest<unknown>) {
  const uid = authedUid(call)
  return guarded(async () => {
    const request = parseTeamRef(call.data)
    await enforceRate(uid, 'manage', RATE.manage)
    await db().runTransaction(async tx => {
      const [quizSnap, teamSnap, metaSnap] = await Promise.all([tx.get(quizRef(request.quizId)), tx.get(teamRef(request.quizId, request.teamId)), tx.get(metaRef(request.quizId))])
      const quiz = readQuiz(quizSnap)
      assertOwner(quiz, uid)
      const team = readTeam(teamSnap)
      for (const id of team.memberIds) tx.delete(membershipRef(id, request.quizId))
      tx.delete(teamRef(request.quizId, request.teamId))
      if (team.code) tx.delete(codeRef(request.quizId, team.code))
      tx.set(metaRef(request.quizId), { teamCount: Math.max(0, teamCountOf(metaSnap) - 1) }, { merge: true })
    })
    await purgeTeamData(request.quizId, request.teamId)
    return { ok: true }
  })
}
