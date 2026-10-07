import {
  addDoc,
  collectionGroup,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { generateInviteToken, inviteExpiryMs } from '../collab/inviteLink'
import type { CollabRole, MemberView, InviteView, ActivityRecord } from '../collab/types'

const graphViewsPath = (classId: string) => ['classes', classId, 'graphViews'] as const
const graphPath = (classId: string, graphId: string) => [...graphViewsPath(classId), graphId] as const
const graphSubPath = (classId: string, graphId: string, sub: string) => [...graphPath(classId, graphId), sub] as const
const graphPresencePath = (classId: string, graphId: string) => [...graphSubPath(classId, graphId, 'presence')] as const

export interface SharedGraphSnapshot {
  id: string
  ownerId: string
  ownerName: string
  classId: string
  title: string
  nodeIds: string[]
  positions: Record<string, { x: number; y: number; isFixed?: boolean }>
}

export interface GraphConfig {
  nodeIds: string[]
  positions: Record<string, { x: number; y: number; isFixed?: boolean }>
}

export interface GraphPresence {
  uid: string
  name: string
  online: boolean
  lastActiveMs: number
}

export interface SharedGraphRef extends SharedGraphSnapshot {
  role: CollabRole
}

export function watchGraphPresence(
  classId: string,
  graphId: string,
  onChange: (people: Map<string, GraphPresence>) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(collection(db, ...graphPresencePath(classId, graphId)), (snap) => {
    const people = new Map<string, GraphPresence>()
    for (const item of snap.docs) {
      const data = item.data()
      if (typeof data.name !== 'string' || data.online !== true || !(data.lastActive instanceof Timestamp)) continue
      people.set(item.id, {
        uid: item.id,
        name: data.name,
        online: true,
        lastActiveMs: data.lastActive.toMillis(),
      })
    }

    onChange(people)
  }, onError)
}

export function watchSharedGraphs(
  uid: string,
  onChange: (graphs: SharedGraphRef[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  let generation = 0
  return onSnapshot(query(collectionGroup(db, 'members'), where('uid', '==', uid)), (snap) => {
    const currentGeneration = ++generation
    const refs = snap.docs.flatMap((item) => {
      const role = item.data().role
      const graph = item.ref.parent.parent
      const classDoc = graph?.parent.parent
      return graph?.parent.id === 'graphViews' && classDoc && (role === 'viewer' || role === 'editor')
        ? [{ classId: classDoc.id, graphId: graph.id, role }]
        : []
    })
    void Promise.all(refs.map(async ({ classId, graphId, role }) => {
      try {
        const snap = await getDoc(doc(db, ...graphPath(classId, graphId)))
        if (!snap.exists()) return { graph: null, error: null }
        const data = snap.data()
        if (
          typeof data.ownerId !== 'string'
          || typeof data.ownerName !== 'string'
          || data.classId !== classId
          || !Array.isArray(data.nodeIds)
          || !data.nodeIds.every((id) => typeof id === 'string')
          || typeof data.positions !== 'object'
          || data.positions === null
          || Array.isArray(data.positions)
        ) return { graph: null, error: null }
        const positions: SharedGraphSnapshot['positions'] = {}
        for (const [id, value] of Object.entries(data.positions).slice(0, 80)) {
          if (value && typeof value === 'object'
            && Number.isFinite((value as { x?: number }).x)
            && Number.isFinite((value as { y?: number }).y)) {
            const position = value as { x: number; y: number; isFixed?: boolean }
            positions[id] = { x: position.x, y: position.y, isFixed: position.isFixed === true }
          }
        }
        const graph: SharedGraphRef = {
          id: snap.id,
          classId,
          ownerId: data.ownerId,
          ownerName: data.ownerName.slice(0, 80),
          title: typeof data.title === 'string' ? data.title : 'Shared graph view',
          nodeIds: data.nodeIds.filter((id) => id.length <= 300).slice(0, 80),
          positions,
          role,
        }
        return { graph, error: null }
      } catch (cause) {
        return { graph: null, error: cause instanceof Error ? cause : new Error('Could not load a shared graph.') }
      }
    })).then((results) => {
      if (currentGeneration !== generation) return
      onChange(results.flatMap(({ graph }) => graph ? [graph] : []))
      const failure = results.find(({ error }) => error !== null)?.error
      if (failure) onError(failure)
    }, (cause: unknown) => {
      if (currentGeneration === generation) onError(cause instanceof Error ? cause : new Error('Could not load shared graphs.'))
    })
  }, onError)
}

export function writeGraphPresence(
  classId: string,
  graphId: string,
  uid: string,
  name: string,
  online: boolean,
  db: Firestore = firestore,
): Promise<void> {
  return setDoc(doc(db, ...graphPresencePath(classId, graphId), uid), {
    uid,
    name: name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner',
    online,
    lastActive: serverTimestamp(),
  })
}

export async function createSharedGraph(
  classId: string,
  ownerId: string,
  ownerName: string,
  config: GraphConfig,
  db: Firestore = firestore,
): Promise<string> {
  const result = await addDoc(collection(db, ...graphViewsPath(classId)), {
    ownerId,
    ownerName: ownerName.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Graph owner',
    classId,
    title: 'Shared graph view',
    nodeIds: config.nodeIds.slice(0, 80),
    positions: Object.fromEntries(Object.entries(config.positions).slice(0, 80)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return result.id
}

export async function saveSharedGraph(
  classId: string,
  graphId: string,
  config: GraphConfig,
  db: Firestore = firestore,
): Promise<void> {
  await updateDoc(doc(db, ...graphPath(classId, graphId)), {
    nodeIds: config.nodeIds.slice(0, 80),
    positions: Object.fromEntries(Object.entries(config.positions).slice(0, 80)),
    updatedAt: serverTimestamp(),
  })
}

export function watchSharedGraph(
  classId: string,
  graphId: string,
  onChange: (graph: SharedGraphSnapshot | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(doc(db, ...graphPath(classId, graphId)), (snap) => {
    if (!snap.exists()) {
      onChange(null)
      return
    }
    const data = snap.data()
    if (
      typeof data.ownerId !== 'string'
      || typeof data.ownerName !== 'string'
      || data.classId !== classId
      || !Array.isArray(data.nodeIds)
      || !data.nodeIds.every((id) => typeof id === 'string')
      || typeof data.positions !== 'object'
      || data.positions === null
      || Array.isArray(data.positions)
    ) {
      onChange(null)
      return
    }
    const positions: SharedGraphSnapshot['positions'] = {}
    for (const [id, value] of Object.entries(data.positions).slice(0, 80)) {
      if (
        value && typeof value === 'object'
        && Number.isFinite((value as { x?: number }).x)
        && Number.isFinite((value as { y?: number }).y)
      ) {
        const position = value as { x: number; y: number; isFixed?: boolean }
        positions[id] = { x: position.x, y: position.y, isFixed: position.isFixed === true }
      }
    }
    onChange({
      id: snap.id,
      ownerId: data.ownerId,
      ownerName: data.ownerName.slice(0, 80),
      classId,
      title: typeof data.title === 'string' ? data.title : 'Shared graph view',
      nodeIds: data.nodeIds.filter((id) => id.length <= 300).slice(0, 80),
      positions,
    })
  }, onError)
}

export async function createGraphInvite(
  classId: string,
  graphId: string,
  ownerId: string,
  role: CollabRole,
  expiry: '7' | '30' | 'never',
  db: Firestore = firestore,
): Promise<string> {
  const token = generateInviteToken()
  const expiresMs = inviteExpiryMs(expiry, Date.now())
  await setDoc(doc(db, ...graphSubPath(classId, graphId, 'invites'), token), {
    createdBy: ownerId,
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: expiresMs === null ? null : Timestamp.fromMillis(expiresMs),
  })
  return token
}

export async function acceptGraphInvite(
  classId: string,
  graphId: string,
  token: string,
  uid: string,
  displayName: string,
  db: Firestore = firestore,
): Promise<{ role: CollabRole; joined: boolean }> {
  const memberRef = doc(db, ...graphSubPath(classId, graphId, 'members'), uid)
  const existing = await getDoc(memberRef)
  if (existing.exists() && (existing.data().role === 'viewer' || existing.data().role === 'editor')) {
    await getDoc(doc(db, ...graphPath(classId, graphId)))
    return { role: existing.data().role, joined: false }
  }
  const inviteRef = doc(db, ...graphSubPath(classId, graphId, 'invites'), token)
  const invite = await getDoc(inviteRef)
  if (!invite.exists()) throw new Error('This graph invite is not valid.')
  const data = invite.data()
  if (data.active !== true) throw new Error('This graph invite is no longer active.')
  if (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() <= Date.now()) {
    throw new Error('This graph invite has expired.')
  }
  if (data.role !== 'viewer' && data.role !== 'editor') throw new Error('This graph invite is not valid.')
  await setDoc(memberRef, {
    uid,
    role: data.role,
    displayName: displayName.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner',
    invitedBy: data.createdBy,
    grantedByToken: token,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { role: data.role, joined: true }
}

export function watchGraphMembers(
  classId: string,
  graphId: string,
  onChange: (members: MemberView[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(collection(db, ...graphSubPath(classId, graphId, 'members')), (snap) => {
    onChange(snap.docs.map((item) => {
      const data = item.data()
      return {
        uid: item.id,
        role: data.role === 'editor' ? 'editor' : 'viewer',
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Learner',
        joinedAtMs: data.joinedAt instanceof Timestamp ? data.joinedAt.toMillis() : null,
      }
    }))
  }, onError)
}

export function watchGraphRole(
  classId: string,
  graphId: string,
  uid: string,
  onChange: (role: CollabRole | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(doc(db, ...graphSubPath(classId, graphId, 'members'), uid), (snap) => {
    const role = snap.exists() ? snap.data().role : null
    onChange(role === 'viewer' || role === 'editor' ? role : null)
  }, onError)
}

export function watchGraphInvites(
  classId: string,
  graphId: string,
  onChange: (invites: InviteView[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(collection(db, ...graphSubPath(classId, graphId, 'invites')), (snap) => {
    onChange(snap.docs.map((item) => {
      const data = item.data()
      return {
        token: item.id,
        role: data.role === 'editor' ? 'editor' : 'viewer',
        active: data.active === true,
        createdBy: typeof data.createdBy === 'string' ? data.createdBy : '',
        createdAtMs: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null,
        expiresAtMs: data.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : null,
      }
    }))
  }, onError)
}

export function watchGraphActivity(
  classId: string,
  graphId: string,
  onChange: (items: ActivityRecord[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    query(collection(db, ...graphSubPath(classId, graphId, 'activity')), orderBy('createdAt', 'desc'), limit(30)),
    (snap) => onChange(snap.docs.slice(0, 30).map((item) => {
      const data = item.data()
      return {
        id: item.id,
        actorId: typeof data.actorId === 'string' ? data.actorId : '',
        actorName: typeof data.actorName === 'string' ? data.actorName : 'Learner',
        type: data.type === 'member' ? 'member' : 'edit',
        summary: typeof data.summary === 'string' ? data.summary : '',
        changes: Array.isArray(data.changes) ? data.changes.filter((line): line is string => typeof line === 'string').slice(0, 10) : [],
        createdAtMs: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : null,
      }
    })),
    onError,
  )
}

export async function logGraphActivity(
  classId: string,
  graphId: string,
  actor: { uid: string; name: string },
  summary: string,
  type: 'edit' | 'member' = 'edit',
  db: Firestore = firestore,
): Promise<void> {
  const text = summary.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!text) return
  await addDoc(collection(db, ...graphSubPath(classId, graphId, 'activity')), {
    actorId: actor.uid,
    actorName: actor.name.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner',
    type,
    summary: text,
    changes: [],
    createdAt: serverTimestamp(),
  })
}

export async function changeGraphMemberRole(
  classId: string, graphId: string, uid: string, role: CollabRole, db: Firestore = firestore,
) {
  await updateDoc(doc(db, ...graphSubPath(classId, graphId, 'members'), uid), { role, updatedAt: serverTimestamp() })
}

export async function removeGraphMember(classId: string, graphId: string, uid: string, db: Firestore = firestore) {
  await deleteDoc(doc(db, ...graphSubPath(classId, graphId, 'members'), uid))
}

export async function updateGraphInvite(classId: string, graphId: string, token: string, active: boolean, db: Firestore = firestore) {
  await updateDoc(doc(db, ...graphSubPath(classId, graphId, 'invites'), token), { active })
}
