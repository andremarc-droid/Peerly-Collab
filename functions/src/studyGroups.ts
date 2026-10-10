import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

const db = getFirestore()
const codePattern = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/
const tokenPattern = /^[A-Za-z0-9_-]{32,64}$/
const memberLimit = 30
const ownedLimit = 10
const joinedLimit = 20
const groupPageSize = 300

function uidFrom(call: CallableRequest<unknown>): string {
  if (!call.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to use study groups.')
  return call.auth.uid
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpsError('invalid-argument', 'The request is invalid.')
  return value as Record<string, unknown>
}
function shortText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw new HttpsError('invalid-argument', `${label} must be between ${min} and ${max} characters.`)
  return value.trim()
}
function groupIdFrom(data: unknown): string {
  const value = record(data).groupId
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'A valid group is required.')
  return value
}
function groupCodeFrom(data: unknown): string {
  const value = record(data).code
  if (typeof value !== 'string' || !codePattern.test(value)) throw new HttpsError('invalid-argument', 'Enter a valid 8-character group code.')
  return value
}
function stateRef(uid: string) { return db.doc(`users/${uid}/groupState/summary`) }
function indexRef(uid: string, groupId: string) { return db.doc(`users/${uid}/groupMemberships/${groupId}`) }
function codeRef(code: string) { return db.doc(`learningInviteCodes/${code}`) }
function callableGroup(data: FirebaseFirestore.DocumentData, id: string) {
  return { id, name: data.name, description: data.description, memberCount: data.memberCount, joiningOpen: data.joiningOpen }
}
async function groupForCode(code: string) {
  const invite = await codeRef(code).get()
  if (!invite.exists || invite.get('kind') !== 'group') throw new HttpsError('not-found', 'That group code was not found.')
  const groupId = invite.get('itemId')
  if (typeof groupId !== 'string') throw new HttpsError('not-found', 'That group code was not found.')
  const groupRef = db.doc(`groups/${groupId}`)
  const group = await groupRef.get()
  if (!group.exists || group.get('joinCode') !== code || group.get('ownerId') !== invite.get('ownerId')) throw new HttpsError('not-found', 'That group code is no longer active.')
  return { groupRef, group, inviteRef: invite.ref }
}
function checkCounters(value: FirebaseFirestore.DocumentData | undefined): { ownedCount: number; joinedCount: number } {
  const ownedCount = value?.ownedCount ?? 0
  const joinedCount = value?.joinedCount ?? 0
  if (!Number.isInteger(ownedCount) || !Number.isInteger(joinedCount) || ownedCount < 0 || joinedCount < 0) throw new HttpsError('failed-precondition', 'Your group membership limits need account repair.')
  return { ownedCount, joinedCount }
}
function assertLessonPlan(data: FirebaseFirestore.DocumentData): void {
  if (typeof data.title !== 'string' || data.title.length < 1 || data.title.length > 120 || typeof data.topic !== 'string' || data.topic.length < 1 || data.topic.length > 500
    || !['beginner', 'intermediate', 'advanced'].includes(data.level) || !Array.isArray(data.order) || data.order.length < 1 || data.order.length > 12
    || data.lessonCount !== data.order.length || !['ready', 'partial'].includes(data.status)) throw new HttpsError('failed-precondition', 'This lesson plan is not in a shareable format.')
}
function assertLesson(data: FirebaseFirestore.DocumentData): void {
  const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.length >= min && value.length <= max
  const questionOk = (question: any) => question && typeof question === 'object' && ['written', 'multiple-choice'].includes(question.kind)
    && text(question.id, 1, 128) && (!('cardId' in question) || text(question.cardId, 1, 128))
    && text(question.prompt, 1, 500) && text(question.answer, 1, 600) && text(question.explanation, 0, 500)
    && (question.kind === 'written' ? !('options' in question) && !('correctIndex' in question)
      : Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 4 && question.options.every((option: unknown) => text(option, 1, 300))
        && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < question.options.length && question.options[question.correctIndex] === question.answer)
  if (!text(data.title, 1, 120) || !text(data.objective, 1, 300) || !text(data.content, 1, 2000) || !Array.isArray(data.keyPoints) || data.keyPoints.length < 1 || data.keyPoints.length > 6 || !data.keyPoints.every((item: unknown) => text(item, 1, 200))
    || !Array.isArray(data.flashcards) || data.flashcards.length < 5 || data.flashcards.length > 10 || !data.flashcards.every((card: any) => card && text(card.id, 1, 128) && text(card.front, 1, 300) && text(card.back, 1, 600))
    || !Array.isArray(data.quiz) || data.quiz.length < 3 || data.quiz.length > 6 || !data.quiz.every(questionOk)) throw new HttpsError('failed-precondition', 'A lesson in this plan is not in a shareable format.')
}
function assertDeck(data: FirebaseFirestore.DocumentData): void {
  if (data.kind !== 'personal' || !Array.isArray(data.cards) || data.cards.length < 1 || data.cards.length > 100 || data.cardCount !== data.cards.length
    || data.cards.some((card: unknown) => !card || typeof card !== 'object' || typeof (card as { front?: unknown }).front !== 'string' || (card as { front: string }).front.length < 1 || (card as { front: string }).front.length > 300 || typeof (card as { back?: unknown }).back !== 'string' || (card as { back: string }).back.length < 1 || (card as { back: string }).back.length > 600)) throw new HttpsError('failed-precondition', 'This deck is not in a shareable format.')
}
function assertCanvas(data: FirebaseFirestore.DocumentData, content: FirebaseFirestore.DocumentData): void {
  if (data.kind !== 'personal' || !Number.isInteger(data.nodeCount) || data.nodeCount < 0 || data.nodeCount > 80 || !Number.isInteger(data.edgeCount) || data.edgeCount < 0 || data.edgeCount > 120 || !Array.isArray(data.refs) || data.refs.length > 80
    || content.version !== 1 || !Array.isArray(content.nodes) || content.nodes.length > 80 || !Array.isArray(content.edges) || content.edges.length > 120 || content.nodes.length !== data.nodeCount || content.edges.length !== data.edgeCount) throw new HttpsError('failed-precondition', 'This canvas is not in a shareable format.')
}

export async function createStudyGroup(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const data = record(call.data)
  const name = shortText(data.name, 'Group name', 1, 80)
  const description = shortText(data.description ?? '', 'Group description', 0, 300)
  const displayName = shortText(data.displayName, 'Display name', 1, 60)
  const joinCode = data.joinCode
  const inviteToken = data.inviteToken
  if (typeof joinCode !== 'string' || !codePattern.test(joinCode) || typeof inviteToken !== 'string' || !tokenPattern.test(inviteToken)) throw new HttpsError('invalid-argument', 'Group invite data is invalid.')
  const groupRef = db.collection('groups').doc()
  const state = stateRef(uid)
  const invite = codeRef(joinCode)
  await db.runTransaction(async tx => {
    const [stateSnap, inviteSnap] = await Promise.all([tx.get(state), tx.get(invite)])
    const counts = checkCounters(stateSnap.data())
    if (counts.ownedCount >= ownedLimit) throw new HttpsError('resource-exhausted', `You can own up to ${ownedLimit} groups.`)
    if (counts.joinedCount >= joinedLimit) throw new HttpsError('resource-exhausted', `You can join up to ${joinedLimit} groups.`)
    if (inviteSnap.exists) throw new HttpsError('already-exists', 'That group code is already in use. Please try again.')
    const now = FieldValue.serverTimestamp()
    tx.create(groupRef, { name, description, ownerId: uid, memberCount: 1, createdAt: now, updatedAt: now, joinCode, joiningOpen: true })
    tx.create(groupRef.collection('members').doc(uid), { role: 'owner', displayName, joinedAt: now })
    tx.set(state, { ownedCount: counts.ownedCount + 1, joinedCount: counts.joinedCount })
    tx.create(indexRef(uid, groupRef.id), { uid, groupId: groupRef.id, role: 'owner', joinedAt: now })
    tx.create(invite, { kind: 'group', itemId: groupRef.id, inviteToken, ownerId: uid, createdAt: now, expiresAt: null })
  })
  return { groupId: groupRef.id }
}

export async function previewStudyGroup(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const code = groupCodeFrom(call.data)
  const { group, groupRef } = await groupForCode(code)
  if ((await groupRef.collection('members').doc(uid).get()).exists) throw new HttpsError('already-exists', 'You already joined this group.')
  if (group.get('joiningOpen') !== true) throw new HttpsError('failed-precondition', 'This group has paused joining.')
  const member = await groupRef.collection('members').count().get()
  if (member.data().count >= memberLimit) throw new HttpsError('resource-exhausted', 'This group is full.')
  return callableGroup(group.data()!, group.id)
}

export async function joinStudyGroup(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const data = record(call.data)
  const code = groupCodeFrom({ code: data.code })
  const displayName = shortText(data.displayName, 'Display name', 1, 60)
  const { groupRef, inviteRef } = await groupForCode(code)
  const memberRef = groupRef.collection('members').doc(uid)
  const state = stateRef(uid)
  await db.runTransaction(async tx => {
    const [group, invite, member, counters, groupMembers] = await Promise.all([
      tx.get(groupRef), tx.get(inviteRef), tx.get(memberRef), tx.get(state), tx.get(groupRef.collection('members')),
    ])
    if (!group.exists || invite.get('kind') !== 'group' || invite.get('itemId') !== groupRef.id || group.get('joinCode') !== code) throw new HttpsError('not-found', 'That group code is no longer active.')
    if (member.exists) throw new HttpsError('already-exists', 'You already joined this group.')
    if (group.get('joiningOpen') !== true) throw new HttpsError('failed-precondition', 'This group has paused joining.')
    const counts = checkCounters(counters.data())
    if (counts.joinedCount >= joinedLimit) throw new HttpsError('resource-exhausted', `You can join up to ${joinedLimit} groups.`)
    if (groupMembers.size >= memberLimit) throw new HttpsError('resource-exhausted', 'This group is full.')
    const now = FieldValue.serverTimestamp()
    tx.update(groupRef, { memberCount: groupMembers.size + 1, updatedAt: now })
    tx.create(memberRef, { role: 'member', displayName, joinedAt: now })
    tx.set(state, { ...counts, joinedCount: counts.joinedCount + 1 })
    tx.create(indexRef(uid, groupRef.id), { uid, groupId: groupRef.id, role: 'member', joinedAt: now })
  })
  return { groupId: groupRef.id }
}

async function deleteUserShares(groupId: string, uid: string): Promise<void> {
  while (true) {
    const shares = await db.collection(`groups/${groupId}/shares`).where('ownerId', '==', uid).limit(groupPageSize).get()
    if (shares.empty) return
    for (const share of shares.docs) {
      const snapshotPath = share.get('snapshotPath')
      if (typeof snapshotPath === 'string' && snapshotPath.startsWith(`groups/${groupId}/sharedContent/`)) await db.recursiveDelete(db.doc(snapshotPath))
      await share.ref.delete()
    }
  }
}

async function removeMember(groupId: string, actorUid: string, targetUid: string, ownerAction: boolean): Promise<void> {
  const groupRef = db.doc(`groups/${groupId}`)
  const memberRef = groupRef.collection('members').doc(targetUid)
  const state = stateRef(targetUid)
  await db.runTransaction(async tx => {
    const [group, actor, target, counters, memberCount] = await Promise.all([
      tx.get(groupRef), tx.get(groupRef.collection('members').doc(actorUid)), tx.get(memberRef), tx.get(state), tx.get(groupRef.collection('members')),
    ])
    if (!group.exists || !actor.exists || !target.exists) throw new HttpsError('not-found', 'The group member no longer exists.')
    if (ownerAction ? actor.get('role') !== 'owner' : actorUid !== targetUid) throw new HttpsError('permission-denied', 'You cannot remove this group member.')
    if (target.get('role') === 'owner') throw new HttpsError('failed-precondition', 'The group owner must delete the group instead of leaving it.')
    const counts = checkCounters(counters.data())
    if (counts.joinedCount < 1 || groupCount(group.get('memberCount')) <= 1) throw new HttpsError('failed-precondition', 'Group membership counts are inconsistent.')
    tx.update(groupRef, { memberCount: memberCount.size - 1, updatedAt: FieldValue.serverTimestamp() })
    tx.delete(memberRef)
    tx.set(state, { ...counts, joinedCount: counts.joinedCount - 1 })
    tx.delete(indexRef(targetUid, groupId))
  })
  await deleteUserShares(groupId, targetUid)
}
function groupCount(value: unknown): number { return Number.isInteger(value) ? value as number : -1 }

export async function leaveStudyGroup(call: CallableRequest<unknown>) {
  const uid = uidFrom(call); const groupId = groupIdFrom(call.data)
  await removeMember(groupId, uid, uid, false)
  return { success: true }
}
export async function removeStudyGroupMember(call: CallableRequest<unknown>) {
  const uid = uidFrom(call); const data = record(call.data); const groupId = groupIdFrom(data)
  const targetUid = data.memberUid
  if (typeof targetUid !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(targetUid) || targetUid === uid) throw new HttpsError('invalid-argument', 'Choose another group member to remove.')
  await removeMember(groupId, uid, targetUid, true)
  return { success: true }
}

export async function shareStudyItem(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const data = record(call.data)
  const groupId = groupIdFrom(data)
  const kind = data.kind
  const sourceId = data.sourceId
  const sourceClassId = data.sourceClassId
  if (!['lessonPlan', 'deck', 'canvas'].includes(String(kind)) || typeof sourceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceId)) throw new HttpsError('invalid-argument', 'Choose a valid study item.')
  const groupRef = db.doc(`groups/${groupId}`)
  const membership = await groupRef.collection('members').doc(uid).get()
  if (!membership.exists) throw new HttpsError('permission-denied', 'Join the group before sharing study items.')
  const shareRef = groupRef.collection('shares').doc()
  const snapshotRef = groupRef.collection('sharedContent').doc(shareRef.id)
  const now = FieldValue.serverTimestamp()
  let snapshot: Record<string, unknown>
  const childSnapshots: Array<{ path: string; data: FirebaseFirestore.DocumentData }> = []
  let title = ''
  if (kind === 'lessonPlan') {
    const source = db.doc(`users/${uid}/lessonPlans/${sourceId}`)
    const plan = await source.get()
    if (!plan.exists) throw new HttpsError('not-found', 'Lesson plan not found.')
    assertLessonPlan(plan.data()!)
    title = String(plan.get('title'))
    const lessons = await source.collection('lessons').get()
    if (lessons.size > 12) throw new HttpsError('failed-precondition', 'This lesson plan is too large to share.')
    snapshot = { kind, ownerId: uid, sourceId, sourceClassId: null, title, data: plan.data(), createdAt: now }
    for (const item of lessons.docs) {
      if (!plan.get('order').includes(item.id)) throw new HttpsError('failed-precondition', 'This lesson plan contains an unlisted lesson.')
      assertLesson(item.data())
      childSnapshots.push({ path: `lessons/${item.id}`, data: item.data() })
    }
  } else {
    if (typeof sourceClassId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceClassId)) throw new HttpsError('invalid-argument', 'The study item class is invalid.')
    const path = kind === 'deck' ? `classes/${sourceClassId}/flashcardDecks/${sourceId}` : `classes/${sourceClassId}/learningCanvases/${sourceId}`
    const source = await db.doc(path).get()
    if (!source.exists || source.get('ownerId') !== uid || source.get('kind') !== 'personal') throw new HttpsError('permission-denied', 'Only your own private study item can be shared.')
    if (kind === 'deck') assertDeck(source.data()!)
    title = String(source.get('title'))
    snapshot = { kind, ownerId: uid, sourceId, sourceClassId, title, data: source.data(), createdAt: now }
    if (kind === 'canvas') {
      const content = await db.doc(`${path}/content/main`).get()
      if (!content.exists) throw new HttpsError('failed-precondition', 'Canvas content is missing.')
      assertCanvas(source.data()!, content.data()!)
      childSnapshots.push({ path: 'content/main', data: content.data()! })
    }
  }
  await db.runTransaction(async tx => {
    const current = await tx.get(groupRef)
    if (!current.exists || !membership.exists) throw new HttpsError('not-found', 'The group is no longer available.')
    tx.create(shareRef, { kind, ownerId: uid, title: shortText(title, 'Study item title', 1, 120), snapshotPath: snapshotRef.path, sharedAt: now })
    tx.create(snapshotRef, snapshot)
    childSnapshots.forEach(child => tx.create(snapshotRef.collection(child.path.split('/')[0]!).doc(child.path.split('/')[1]!), child.data))
  })
  return { shareId: shareRef.id }
}

export async function unshareStudyItem(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const data = record(call.data)
  const groupId = groupIdFrom(data)
  const shareId = data.shareId
  if (typeof shareId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(shareId)) throw new HttpsError('invalid-argument', 'Choose a valid shared item.')
  const groupRef = db.doc(`groups/${groupId}`)
  const shareRef = groupRef.collection('shares').doc(shareId)
  const [member, share] = await Promise.all([groupRef.collection('members').doc(uid).get(), shareRef.get()])
  if (!member.exists || !share.exists) throw new HttpsError('not-found', 'This shared item is no longer available.')
  const group = await groupRef.get()
  if (share.get('ownerId') !== uid && (member.get('role') !== 'owner' || group.get('ownerId') !== uid)) throw new HttpsError('permission-denied', 'Only the sharer or group owner can remove this copy.')
  await db.recursiveDelete(groupRef.collection('sharedContent').doc(shareId))
  await shareRef.delete()
  return { success: true }
}

export async function deleteStudyGroup(call: CallableRequest<unknown>) {
  const uid = uidFrom(call); const groupId = groupIdFrom(call.data); const groupRef = db.doc(`groups/${groupId}`)
  const membersRef = groupRef.collection('members')
  await db.runTransaction(async tx => {
    const [group, members] = await Promise.all([tx.get(groupRef), tx.get(membersRef)])
    if (!group.exists) return
    const owner = members.docs.find(member => member.id === uid && member.get('role') === 'owner')
    if (group.get('ownerId') !== uid || !owner) throw new HttpsError('permission-denied', 'Only the group owner can delete this group.')
    const memberDocs = members.docs
    const refs = memberDocs.map(member => ({ uid: member.id, state: stateRef(member.id), index: indexRef(member.id, groupId) }))
    const states = await tx.getAll(...refs.map(ref => ref.state))
    for (let index = 0; index < refs.length; index += 1) {
      const ref = refs[index]!
      const member = memberDocs[index]!
      const counts = checkCounters(states[index]?.data())
      tx.set(ref.state, {
        ownedCount: Math.max(0, counts.ownedCount - (member.id === uid ? 1 : 0)),
        joinedCount: Math.max(0, counts.joinedCount - (member.id === uid ? 0 : 1)),
      })
      tx.delete(ref.index)
      tx.delete(member.ref)
    }
    const code = group.get('joinCode')
    if (typeof code === 'string') tx.delete(codeRef(code))
    tx.delete(groupRef)
  })
  try { await db.recursiveDelete(groupRef) } catch { throw new HttpsError('internal', 'The group was closed, but its shared snapshots need cleanup. Try again.') }
  return { success: true }
}

async function deleteOwnedGroup(uid: string, groupId: string): Promise<void> {
  const groupRef = db.doc(`groups/${groupId}`)
  const membersRef = groupRef.collection('members')
  await db.runTransaction(async tx => {
    const [group, members] = await Promise.all([tx.get(groupRef), tx.get(membersRef)])
    if (!group.exists) return
    if (group.get('ownerId') !== uid || !members.docs.some(member => member.id === uid && member.get('role') === 'owner')) throw new HttpsError('permission-denied', 'Only the group owner can delete this group.')
    const refs = members.docs.map(member => ({ uid: member.id, member: member.ref, state: stateRef(member.id), index: indexRef(member.id, groupId) }))
    const states = await tx.getAll(...refs.map(ref => ref.state))
    refs.forEach((ref, index) => {
      const counts = checkCounters(states[index]?.data())
      tx.set(ref.state, { ownedCount: Math.max(0, counts.ownedCount - (ref.uid === uid ? 1 : 0)), joinedCount: Math.max(0, counts.joinedCount - (ref.uid === uid ? 0 : 1)) })
      tx.delete(ref.index); tx.delete(ref.member)
    })
    const code = group.get('joinCode')
    if (typeof code === 'string') tx.delete(codeRef(code))
    tx.delete(groupRef)
  })
  try { await db.recursiveDelete(groupRef) } catch { throw new HttpsError('internal', 'The group was closed, but its shared snapshots need cleanup. Try again.') }
}

export async function cleanupStudyGroups(call: CallableRequest<unknown>) {
  const uid = uidFrom(call)
  const memberships = await db.collection(`users/${uid}/groupMemberships`).limit(ownedLimit + joinedLimit).get()
  for (const index of memberships.docs) {
    const groupRef = db.doc(`groups/${index.id}`)
    const group = await groupRef.get()
    if (!group.exists) { await index.ref.delete(); continue }
    if (group.get('ownerId') === uid) await deleteOwnedGroup(uid, group.id)
    else await removeMember(group.id, uid, uid, false)
  }
  await db.doc(`users/${uid}/groupState/summary`).delete().catch(() => undefined)
  return { success: true }
}
