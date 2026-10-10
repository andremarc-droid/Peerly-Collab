import { httpsCallable } from 'firebase/functions'
import { collection, collectionGroup, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import { functions } from '../../lib/firebase/functions'
import { createInviteCode, findLearningInviteCode } from '../learningSharing/inviteCodes'
import { createDeck } from '../flashcards/services'
import { createCanvas } from '../learningCanvas/services'
import { createLessonPlan } from '../lessons/services'
import type { LessonRecord } from '../lessons/types'
import { MAX_LESSONS } from '../lessons/schemas'
import { parseGroupMember, parseGroupShare, parseStudyGroup, validateGroupCreate } from './schemas'
import type { GroupPreview, GroupShare, StudyGroup, StudyGroupMember } from './types'

const call = <I, O>(name: string, data: I) => httpsCallable<I, O>(functions, name)(data).then(result => result.data)
export async function createGroup(name: string, description: string, displayName: string) {
  const input = validateGroupCreate(name, description)
  return call<{ name: string; description: string; displayName: string; joinCode: string; inviteToken: string }, { groupId: string }>('createStudyGroup', { ...input, displayName: displayName.trim(), joinCode: createInviteCode(), inviteToken: crypto.randomUUID().replaceAll('-', '') })
}
export async function previewGroup(code: string): Promise<GroupPreview> {
  const invite = await findLearningInviteCode(code)
  if (invite.kind !== 'group') throw new Error('That code does not belong to a study group.')
  return call<{ code: string }, GroupPreview>('previewStudyGroup', { code: code.trim().toUpperCase().replace(/[\s-]/g, '') })
}
export const joinGroup = (code: string, displayName: string) => call('joinStudyGroup', { code: code.trim().toUpperCase().replace(/[\s-]/g, ''), displayName: displayName.trim() })
export const leaveGroup = (groupId: string) => call('leaveStudyGroup', { groupId })
export const removeGroupMember = (groupId: string, memberUid: string) => call('removeStudyGroupMember', { groupId, memberUid })
export const deleteGroup = (groupId: string) => call('deleteStudyGroup', { groupId })
export const cleanupGroups = () => call('cleanupStudyGroups', {})
export const shareStudyItem = (groupId: string, kind: 'lessonPlan' | 'deck' | 'canvas', sourceId: string, sourceClassId?: string) => call('shareStudyItem', { groupId, kind, sourceId, sourceClassId })
export const unshareGroupItem = (groupId: string, shareId: string) => call('unshareStudyItem', { groupId, shareId })

export function watchMyGroups(uid: string, onChange: (groups: StudyGroup[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  const q = query(collectionGroup(db, 'groupMemberships'), where('uid', '==', uid), orderBy('joinedAt', 'desc'))
  return onSnapshot(q, async snapshot => {
    try {
      const groups = await Promise.all(snapshot.docs.map(async item => {
        const id = item.data().groupId
        if (typeof id !== 'string') return null
        const group = await getDoc(doc(db, 'groups', id))
        return group.exists() ? { ...parseStudyGroup(group.data()), id: group.id } : null
      }))
      onChange(groups.filter((item): item is StudyGroup => item !== null))
    } catch (cause) { onError(cause instanceof Error ? cause : new Error('Could not load groups.')) }
  }, onError)
}
export function watchGroup(groupId: string, onChange: (group: StudyGroup | null) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(doc(db, 'groups', groupId), snap => onChange(snap.exists() ? { ...parseStudyGroup(snap.data()), id: snap.id } : null), onError)
}
export function watchGroupMembers(groupId: string, onChange: (members: StudyGroupMember[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(collection(db, 'groups', groupId, 'members'), snap => onChange(snap.docs.map(item => ({ ...parseGroupMember(item.data()), uid: item.id }))), onError)
}
export function watchGroupShares(groupId: string, onChange: (shares: GroupShare[]) => void, onError: (error: Error) => void, db: Firestore = firestore) {
  return onSnapshot(query(collection(db, 'groups', groupId, 'shares'), orderBy('sharedAt', 'desc')), snap => onChange(snap.docs.map(item => ({ ...parseGroupShare(item.data()), id: item.id }))), onError)
}
export async function setGroupJoining(groupId: string, open: boolean, db: Firestore = firestore) {
  await updateDoc(doc(db, 'groups', groupId), { joiningOpen: open, updatedAt: serverTimestamp() })
}
export async function regenerateGroupCode(groupId: string, ownerId: string, db: Firestore = firestore) {
  const groupRef = doc(db, 'groups', groupId)
  const current = await getDoc(groupRef)
  if (!current.exists() || current.data().ownerId !== ownerId) throw new Error('Only the group owner can change its code.')
  const next = createInviteCode()
  const old = current.data().joinCode
  const batch = writeBatch(db)
  // Deleting a code document that no longer exists would be rejected by the rules, so only delete it when present.
  if (typeof old === 'string' && (await getDoc(doc(db, 'learningInviteCodes', old))).exists()) batch.delete(doc(db, 'learningInviteCodes', old))
  batch.update(groupRef, { joinCode: next, updatedAt: serverTimestamp() })
  batch.set(doc(db, 'learningInviteCodes', next), { kind: 'group', itemId: groupId, inviteToken: crypto.randomUUID().replaceAll('-', ''), ownerId, createdAt: serverTimestamp(), expiresAt: null })
  await batch.commit()
  return next
}
export async function getGroupSnapshot(groupId: string, shareId: string, db: Firestore = firestore) {
  const snap = await getDoc(doc(db, 'groups', groupId, 'sharedContent', shareId))
  if (!snap.exists()) throw new Error('This shared copy is no longer available.')
  return snap.data()
}

export async function importGroupShare(uid: string, groupId: string, shareId: string, db: Firestore = firestore): Promise<string> {
  const snapshot = await getGroupSnapshot(groupId, shareId, db)
  const kind = snapshot.kind
  const source = snapshot.data as Record<string, unknown>
  if (kind === 'deck') {
    const cards = source.cards
    if (!Array.isArray(cards)) throw new Error('This shared deck is invalid.')
    return createDeck(uid, uid, 'personal', { title: String(snapshot.title), description: String(source.description ?? ''), cards: cards as never[], published: false }, db)
  }
  if (kind === 'canvas') {
    const contentRef = doc(db, 'groups', groupId, 'sharedContent', shareId, 'content', 'main')
    const content = await getDoc(contentRef)
    if (!content.exists()) throw new Error('This shared canvas has no board content.')
    const board = content.data() as { nodes?: unknown[]; edges?: unknown[]; viewport?: { x: number; y: number; zoom: number } }
    return createCanvas(uid, uid, { kind: 'personal', title: String(snapshot.title), description: String(source.description ?? ''), initialContent: { nodes: board.nodes as never[] ?? [], edges: board.edges as never[] ?? [], viewport: board.viewport ?? { x: 0, y: 0, zoom: 1 } } }, db)
  }
  if (kind === 'lessonPlan') {
    const lessonsRef = collection(db, 'groups', groupId, 'sharedContent', shareId, 'lessons')
    const lessonDocs = await import('firebase/firestore').then(({ getDocs }) => getDocs(lessonsRef))
    const level = source.level
    if (level !== 'beginner' && level !== 'intermediate' && level !== 'advanced') throw new Error('This shared lesson plan is invalid.')
    const order = Array.isArray(source.order) ? source.order : []
    if (order.length < 1 || order.length > MAX_LESSONS || new Set(order).size !== order.length || !order.every((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new Error('This shared lesson plan is invalid.')
    const lessons: Record<string, LessonRecord> = {}
    for (const item of lessonDocs.docs) if (order.includes(item.id)) lessons[item.id] = item.data() as LessonRecord
    // Each lesson is fully validated by createLessonPlan; the status is recomputed instead of trusted from the snapshot.
    return createLessonPlan(uid, { outline: { title: String(snapshot.title), lessons: order.map(id => ({ id, title: lessons[id]?.title ?? 'Study lesson', objective: lessons[id]?.objective ?? '' })) }, topic: String(source.topic ?? ''), level, lessons, status: order.every(id => id in lessons) ? 'ready' : 'partial' }, db).then(item => item.id)
  }
  throw new Error('This shared study item cannot be imported.')
}
