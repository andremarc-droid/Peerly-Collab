import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

export interface JoinStudyGroupData {
  inviteCode?: string
  groupId?: string
}

export interface LeaveStudyGroupData {
  groupId: string
}

export interface RemoveStudyGroupMemberData {
  groupId: string
  targetUid: string
}

export async function joinStudyGroupHandler(
  request: CallableRequest<JoinStudyGroupData>,
): Promise<{ success: boolean; groupId: string; groupName: string; alreadyMember?: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to join a study group.')
  }

  const uid = request.auth.uid
  const displayName =
    (request.auth.token.name as string | undefined) ||
    (request.auth.token.email as string | undefined) ||
    'Learner'

  const { inviteCode, groupId: directGroupId } = request.data || {}
  const db = getFirestore()

  let targetGroupId = directGroupId?.trim()
  if (!targetGroupId && inviteCode) {
    const norm = inviteCode.toUpperCase().replace(/[\s-]/g, '')
    const codeSnap = await db.doc(`studyGroupCodes/${norm}`).get()
    if (!codeSnap.exists) {
      throw new HttpsError('not-found', 'Invalid invite code. Group not found.')
    }
    targetGroupId = codeSnap.data()?.groupId as string
  }

  if (!targetGroupId) {
    throw new HttpsError('invalid-argument', 'An invite code or group ID is required.')
  }

  const groupRef = db.doc(`studyGroups/${targetGroupId}`)
  const memberRef = db.doc(`studyGroups/${targetGroupId}/members/${uid}`)
  const activityRef = db.collection(`studyGroups/${targetGroupId}/activity`).doc()

  const result = await db.runTransaction(async (transaction) => {
    const groupSnap = await transaction.get(groupRef)
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Study group does not exist.')
    }

    const groupData = groupSnap.data() || {}
    const groupName = groupData.name || 'Study Group'
    const memberCount = groupData.memberCount ?? 0
    const maxMembers = groupData.maxMembers ?? 50

    const memberSnap = await transaction.get(memberRef)
    if (memberSnap.exists) {
      return { success: true, groupId: targetGroupId, groupName, alreadyMember: true }
    }

    if (memberCount >= maxMembers) {
      throw new HttpsError('failed-precondition', `This study group is full (maximum ${maxMembers} members).`)
    }

    const now = FieldValue.serverTimestamp()

    transaction.set(memberRef, {
      uid,
      displayName,
      role: 'member',
      joinedAt: now,
    })

    transaction.update(groupRef, {
      memberCount: FieldValue.increment(1),
      updatedAt: now,
    })

    transaction.set(activityRef, {
      id: activityRef.id,
      type: 'joined',
      actorUid: uid,
      actorName: displayName,
      details: 'joined the group',
      createdAt: now,
    })

    return { success: true, groupId: targetGroupId, groupName }
  })

  return result
}

export async function leaveStudyGroupHandler(
  request: CallableRequest<LeaveStudyGroupData>,
): Promise<{ success: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to leave a study group.')
  }

  const uid = request.auth.uid
  const displayName =
    (request.auth.token.name as string | undefined) ||
    (request.auth.token.email as string | undefined) ||
    'Learner'

  const groupId = request.data?.groupId?.trim()
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'A valid groupId is required.')
  }

  const db = getFirestore()
  const groupRef = db.doc(`studyGroups/${groupId}`)
  const memberRef = db.doc(`studyGroups/${groupId}/members/${uid}`)
  const activityRef = db.collection(`studyGroups/${groupId}/activity`).doc()

  await db.runTransaction(async (transaction) => {
    const groupSnap = await transaction.get(groupRef)
    if (!groupSnap.exists) return

    const groupData = groupSnap.data() || {}
    if (groupData.ownerId === uid) {
      throw new HttpsError(
        'failed-precondition',
        'Group owners cannot leave. You can delete the group in group settings.',
      )
    }

    const memberSnap = await transaction.get(memberRef)
    if (!memberSnap.exists) return

    const now = FieldValue.serverTimestamp()

    transaction.delete(memberRef)
    transaction.update(groupRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: now,
    })

    transaction.set(activityRef, {
      id: activityRef.id,
      type: 'left',
      actorUid: uid,
      actorName: displayName,
      details: 'left the group',
      createdAt: now,
    })
  })

  return { success: true }
}

export async function removeStudyGroupMemberHandler(
  request: CallableRequest<RemoveStudyGroupMemberData>,
): Promise<{ success: boolean }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to remove a member.')
  }

  const ownerUid = request.auth.uid
  const { groupId, targetUid } = request.data || {}
  if (!groupId || !targetUid) {
    throw new HttpsError('invalid-argument', 'groupId and targetUid are required.')
  }

  const db = getFirestore()
  const groupRef = db.doc(`studyGroups/${groupId}`)
  const memberRef = db.doc(`studyGroups/${groupId}/members/${targetUid}`)
  const activityRef = db.collection(`studyGroups/${groupId}/activity`).doc()

  await db.runTransaction(async (transaction) => {
    const groupSnap = await transaction.get(groupRef)
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Study group not found.')
    }

    const groupData = groupSnap.data() || {}
    if (groupData.ownerId !== ownerUid) {
      throw new HttpsError('permission-denied', 'Only the group owner can remove members.')
    }

    if (targetUid === ownerUid) {
      throw new HttpsError('failed-precondition', 'The group owner cannot be removed.')
    }

    const memberSnap = await transaction.get(memberRef)
    if (!memberSnap.exists) return

    const memberName = memberSnap.data()?.displayName || 'A member'
    const now = FieldValue.serverTimestamp()

    transaction.delete(memberRef)
    transaction.update(groupRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: now,
    })

    transaction.set(activityRef, {
      id: activityRef.id,
      type: 'left',
      actorUid: targetUid,
      actorName: memberName,
      details: 'was removed by owner',
      createdAt: now,
    })
  })

  return { success: true }
}
