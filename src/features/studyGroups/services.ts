import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { callServer } from '../../lib/firebase/callServer'
import type { FlashcardDeckWithId } from '../flashcards/types'
import {
  generateGroupInviteCode,
  normalizeGroupInviteCode,
  validateGroupDescription,
  validateGroupName,
} from './schemas'
import type {
  CreateStudyGroupInput,
  JoinStudyGroupResult,
  SharedGroupDeck,
  StudyGroup,
  StudyGroupActivity,
  StudyGroupMember,
} from './types'

export async function createStudyGroup(
  creator: { uid: string; displayName?: string | null },
  input: CreateStudyGroupInput,
  db: Firestore = firestore,
): Promise<string> {
  const nameCheck = validateGroupName(input.name)
  if (!nameCheck.valid) throw new Error(nameCheck.error)

  const descCheck = validateGroupDescription(input.description)
  if (!descCheck.valid) throw new Error(descCheck.error)

  const groupRef = doc(collection(db, 'studyGroups'))
  const groupId = groupRef.id
  const inviteCode = generateGroupInviteCode()
  const now = serverTimestamp()
  const authorName = creator.displayName?.trim() || 'Learner'

  const groupData = {
    id: groupId,
    name: input.name.trim(),
    description: (input.description ?? '').trim().slice(0, 300),
    privacy: input.privacy,
    ownerId: creator.uid,
    ownerDisplayName: authorName,
    inviteCode,
    memberCount: 1,
    maxMembers: 50,
    createdAt: now,
    updatedAt: now,
  }

  const batch = writeBatch(db)
  batch.set(groupRef, groupData)

  const memberRef = doc(db, 'studyGroups', groupId, 'members', creator.uid)
  batch.set(memberRef, {
    uid: creator.uid,
    displayName: authorName,
    role: 'owner',
    joinedAt: now,
  })

  const codeRef = doc(db, 'studyGroupCodes', inviteCode)
  batch.set(codeRef, {
    groupId,
    groupName: input.name.trim(),
    ownerId: creator.uid,
    createdAt: now,
  })

  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  batch.set(actRef, {
    id: actRef.id,
    type: 'joined',
    actorUid: creator.uid,
    actorName: authorName,
    details: 'created the group',
    createdAt: now,
  })

  await batch.commit()
  return groupId
}

export async function getStudyGroup(groupId: string, db: Firestore = firestore): Promise<StudyGroup | null> {
  const snap = await getDoc(doc(db, 'studyGroups', groupId))
  if (!snap.exists()) return null
  return snap.data() as StudyGroup
}

export async function listMyStudyGroups(uid: string, db: Firestore = firestore): Promise<StudyGroup[]> {
  const memberQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid))
  const memberSnap = await getDocs(memberQuery)
  if (memberSnap.empty) return []

  const groupIds = new Set<string>()
  for (const m of memberSnap.docs) {
    const segments = m.ref.path.split('/')
    if (segments[0] === 'studyGroups' && segments[1]) {
      groupIds.add(segments[1])
    }
  }

  const groups: StudyGroup[] = []
  for (const gid of groupIds) {
    const snap = await getDoc(doc(db, 'studyGroups', gid))
    if (snap.exists()) {
      groups.push(snap.data() as StudyGroup)
    }
  }

  return groups.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
}

export async function listPublicStudyGroups(db: Firestore = firestore): Promise<StudyGroup[]> {
  const q = query(
    collection(db, 'studyGroups'),
    where('privacy', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(50),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as StudyGroup)
}

export async function checkIsGroupMember(groupId: string, uid: string, db: Firestore = firestore): Promise<boolean> {
  const memberRef = doc(db, 'studyGroups', groupId, 'members', uid)
  const snap = await getDoc(memberRef)
  return snap.exists()
}

export function subscribeGroupMembers(
  groupId: string,
  onNext: (members: StudyGroupMember[]) => void,
  onError: (err: Error) => void,
  db: Firestore = firestore,
): () => void {
  const q = collection(db, 'studyGroups', groupId, 'members')
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => d.data() as StudyGroupMember))
    },
    (err) => onError(err),
  )
}

export function subscribeGroupSharedDecks(
  groupId: string,
  onNext: (decks: SharedGroupDeck[]) => void,
  onError: (err: Error) => void,
  db: Firestore = firestore,
): () => void {
  const q = query(
    collection(db, 'studyGroups', groupId, 'sharedDecks'),
    orderBy('sharedAt', 'desc'),
    limit(50),
  )
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => d.data() as SharedGroupDeck))
    },
    (err) => onError(err),
  )
}

export function subscribeGroupActivity(
  groupId: string,
  onNext: (activities: StudyGroupActivity[]) => void,
  onError: (err: Error) => void,
  count = 30,
  db: Firestore = firestore,
): () => void {
  const q = query(
    collection(db, 'studyGroups', groupId, 'activity'),
    orderBy('createdAt', 'desc'),
    limit(count),
  )
  return onSnapshot(
    q,
    (snap) => {
      onNext(snap.docs.map((d) => d.data() as StudyGroupActivity))
    },
    (err) => onError(err),
  )
}

export async function shareDeckWithGroup(
  groupId: string,
  deck: FlashcardDeckWithId,
  actor: { uid: string; displayName?: string | null },
  db: Firestore = firestore,
): Promise<void> {
  const now = serverTimestamp()
  const actorName = actor.displayName?.trim() || 'Learner'
  const sharedRef = doc(db, 'studyGroups', groupId, 'sharedDecks', deck.id)

  const sharedData: SharedGroupDeck = {
    id: deck.id,
    deckId: deck.id,
    sourceClassId: deck.classId,
    title: deck.title.trim().slice(0, 120),
    description: (deck.description ?? '').trim().slice(0, 300),
    cardCount: deck.cards.length,
    cards: deck.cards.map(c => ({
      id: c.id,
      front: c.front.trim().slice(0, 300),
      back: c.back.trim().slice(0, 600),
    })),
    sharedByUid: actor.uid,
    sharedByName: actorName,
    sharedAt: now as any,
  }

  const batch = writeBatch(db)
  batch.set(sharedRef, sharedData)

  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  batch.set(actRef, {
    id: actRef.id,
    type: 'deck_shared',
    actorUid: actor.uid,
    actorName,
    details: `shared the deck "${deck.title.trim()}"`,
    createdAt: now,
  })

  await batch.commit()
}

export async function unshareDeckFromGroup(
  groupId: string,
  deckId: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(doc(db, 'studyGroups', groupId, 'sharedDecks', deckId))
}

export async function logStudySessionActivity(
  groupId: string,
  deckTitle: string,
  actor: { uid: string; displayName?: string | null },
  db: Firestore = firestore,
): Promise<void> {
  const actRef = doc(collection(db, 'studyGroups', groupId, 'activity'))
  await setDoc(actRef, {
    id: actRef.id,
    type: 'deck_studied',
    actorUid: actor.uid,
    actorName: actor.displayName?.trim() || 'Learner',
    details: `studied "${deckTitle.slice(0, 80)}"`,
    createdAt: serverTimestamp(),
  })
}

export async function renameStudyGroup(
  groupId: string,
  newName: string,
  db: Firestore = firestore,
): Promise<void> {
  const check = validateGroupName(newName)
  if (!check.valid) throw new Error(check.error)
  await updateDoc(doc(db, 'studyGroups', groupId), {
    name: newName.trim(),
    updatedAt: serverTimestamp(),
  })
}

export async function regenerateGroupInviteCode(
  groupId: string,
  oldCode: string,
  groupName: string,
  ownerId: string,
  db: Firestore = firestore,
): Promise<string> {
  const newCode = generateGroupInviteCode()
  const now = serverTimestamp()

  const batch = writeBatch(db)
  batch.update(doc(db, 'studyGroups', groupId), {
    inviteCode: newCode,
    updatedAt: now,
  })

  if (oldCode) {
    batch.delete(doc(db, 'studyGroupCodes', oldCode))
  }

  batch.set(doc(db, 'studyGroupCodes', newCode), {
    groupId,
    groupName,
    ownerId,
    createdAt: now,
  })

  await batch.commit()
  return newCode
}

export async function deleteStudyGroupCascade(
  groupId: string,
  inviteCode: string,
  db: Firestore = firestore,
): Promise<void> {
  const subcollections = ['members', 'sharedDecks', 'sharedItems', 'activity']
  for (const name of subcollections) {
    const snap = await getDocs(collection(db, 'studyGroups', groupId, name))
    if (!snap.empty) {
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
  }

  if (inviteCode) {
    await deleteDoc(doc(db, 'studyGroupCodes', inviteCode)).catch(() => {})
  }

  await deleteDoc(doc(db, 'studyGroups', groupId))
}

export async function joinStudyGroupWithCode(codeOrId: string): Promise<JoinStudyGroupResult> {
  const norm = normalizeGroupInviteCode(codeOrId)
  const payload = norm.length === 6 ? { inviteCode: norm } : { groupId: codeOrId }
  return callServer<{ inviteCode?: string; groupId?: string }, JoinStudyGroupResult>('joinStudyGroup', payload)
}

export async function joinStudyGroupById(groupId: string): Promise<JoinStudyGroupResult> {
  return callServer<{ inviteCode?: string; groupId?: string }, JoinStudyGroupResult>('joinStudyGroup', { groupId })
}

export async function leaveStudyGroupCallable(groupId: string): Promise<void> {
  await callServer<{ groupId: string }, { success: boolean }>('leaveStudyGroup', { groupId })
}

export async function removeStudyGroupMemberCallable(groupId: string, targetUid: string): Promise<void> {
  await callServer<{ groupId: string; targetUid: string }, { success: boolean }>('removeStudyGroupMember', { groupId, targetUid })
}

export async function cleanupMyStudyGroupsOnAccountDeletion(
  uid: string,
  db: Firestore = firestore,
): Promise<void> {
  const ownedQuery = query(collection(db, 'studyGroups'), where('ownerId', '==', uid))
  const ownedSnap = await getDocs(ownedQuery)
  for (const g of ownedSnap.docs) {
    const data = g.data() as StudyGroup
    await deleteStudyGroupCascade(g.id, data.inviteCode, db)
  }

  // Delete all items shared by this user across all groups
  try {
    const sharedItemsQuery = query(collectionGroup(db, 'sharedItems'), where('sharedByUid', '==', uid))
    const sharedItemsSnap = await getDocs(sharedItemsQuery)
    if (!sharedItemsSnap.empty) {
      const batch = writeBatch(db)
      sharedItemsSnap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit().catch(() => {})
    }
  } catch (err) {
    console.error('Failed to clean up user sharedItems during account deletion:', err)
  }

  const memberQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid))
  const memberSnap = await getDocs(memberQuery)
  for (const m of memberSnap.docs) {
    const segments = m.ref.path.split('/')
    if (segments[0] === 'studyGroups' && segments[1]) {
      const gid = segments[1]
      await deleteDoc(m.ref).catch(() => {})
      const groupRef = doc(db, 'studyGroups', gid)
      const groupSnap = await getDoc(groupRef)
      if (groupSnap.exists()) {
        const count = Math.max(0, (groupSnap.data()?.memberCount ?? 1) - 1)
        await updateDoc(groupRef, { memberCount: count, updatedAt: serverTimestamp() }).catch(() => {})
      }
    }
  }
}

export {
  copySharedItemToLibrary,
  shareItemWithGroup,
  subscribeGroupSharedItems,
  unshareItemFromGroup,
  updateSharedItem,
} from './sharedItemsService'

