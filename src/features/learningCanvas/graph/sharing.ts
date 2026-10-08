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
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { generateInviteToken, inviteExpiryMs } from '../collab/inviteLink'
import type { CollabRole, MemberView, InviteView, ActivityRecord } from '../collab/types'
import { createInviteCode, registerLearningInviteCode } from '../../learningSharing/inviteCodes'

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
  nodes: SharedGraphNode[]
  links: SharedGraphLink[]
}

export interface SharedGraphNode {
  id: string
  rawId: string
  type: 'note' | 'learning' | 'module' | 'quiz' | 'link'
  title: string
  classId: string
  className: string
  description?: string
  content?: string
  x: number
  y: number
  isFixed?: boolean
}

export interface SharedGraphLink {
  id: string
  source: string
  target: string
}

export interface GraphConfig {
  nodeIds: string[]
  positions: Record<string, { x: number; y: number; isFixed?: boolean }>
  nodes: SharedGraphNode[]
  links: SharedGraphLink[]
}

export interface GraphPresence {
  uid: string
  name: string
  online: boolean
  lastActiveMs: number
}

export interface SharedGraphRef extends SharedGraphSnapshot {
  /** 'owner' is a graph view you saved yourself; owners never have a member record. */
  role: CollabRole | 'owner'
}

function parseGraphDocument(id: string, classId: string, data: DocumentData): SharedGraphSnapshot | null {
  if (
    typeof data.ownerId !== 'string'
    || typeof data.ownerName !== 'string'
    || data.classId !== classId
    || !Array.isArray(data.nodeIds)
    || !data.nodeIds.every((nodeId: unknown) => typeof nodeId === 'string')
    || (data.nodes !== undefined && !Array.isArray(data.nodes))
    || (data.links !== undefined && !Array.isArray(data.links))
    || typeof data.positions !== 'object'
    || data.positions === null
    || Array.isArray(data.positions)
  ) return null
  const positions: SharedGraphSnapshot['positions'] = {}
  for (const [nodeId, value] of Object.entries(data.positions).slice(0, 80)) {
    if (value && typeof value === 'object'
      && Number.isFinite((value as { x?: number }).x)
      && Number.isFinite((value as { y?: number }).y)) {
      const position = value as { x: number; y: number; isFixed?: boolean }
      positions[nodeId] = { x: position.x, y: position.y, isFixed: position.isFixed === true }
    }
  }
  return {
    id,
    classId,
    ownerId: data.ownerId,
    ownerName: data.ownerName.slice(0, 80),
    title: typeof data.title === 'string' ? data.title : 'Shared graph view',
    nodeIds: data.nodeIds.filter((nodeId: string) => nodeId.length <= 300).slice(0, 80),
    positions,
    nodes: parseSharedNodes(data.nodes),
    links: parseSharedLinks(data.links),
  }
}

/**
 * Graph views this person saved themselves. A person who owns a graph view has no member record, so
 * `watchSharedGraphs` can never find it; each class is queried for views whose ownerId is this person.
 */
export function watchOwnedGraphs(
  uid: string,
  classIds: string[],
  onChange: (graphs: SharedGraphRef[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  const perClass = new Map<string, SharedGraphRef[]>()
  const emit = () => onChange([...perClass.values()].flat())
  if (classIds.length === 0) onChange([])
  const stops = classIds.map((classId) => onSnapshot(
    query(collection(db, ...graphViewsPath(classId)), where('ownerId', '==', uid)),
    (snap) => {
      perClass.set(classId, snap.docs.flatMap((item) => {
        const graph = parseGraphDocument(item.id, classId, item.data())
        return graph && graph.ownerId === uid ? [{ ...graph, role: 'owner' as const }] : []
      }))
      emit()
    },
    onError,
  ))
  return () => stops.forEach((stop) => stop())
}

function storedNodes(nodes: SharedGraphNode[]): SharedGraphNode[] {
  return nodes.slice(0, 80).map((node) => ({
    id: node.id.slice(0, 300),
    rawId: node.rawId.slice(0, 300),
    type: node.type,
    title: node.title.slice(0, 500),
    classId: node.classId.slice(0, 150),
    className: node.className.slice(0, 120),
    ...(node.description ? { description: node.description.slice(0, 2000) } : {}),
    ...(node.content ? { content: node.content.slice(0, 2000) } : {}),
    x: Math.max(-1500, Math.min(1500, node.x)),
    y: Math.max(-1500, Math.min(1500, node.y)),
    isFixed: node.isFixed === true,
  }))
}

function storedLinks(links: SharedGraphLink[]): SharedGraphLink[] {
  return links.slice(0, 120).map((link) => ({
    id: link.id.slice(0, 650),
    source: link.source.slice(0, 300),
    target: link.target.slice(0, 300),
  }))
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
          || (data.nodes !== undefined && !Array.isArray(data.nodes))
          || (data.links !== undefined && !Array.isArray(data.links))
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
        const nodes = parseSharedNodes(data.nodes)
        const links = parseSharedLinks(data.links)
        const graph: SharedGraphRef = {
          id: snap.id,
          classId,
          ownerId: data.ownerId,
          ownerName: data.ownerName.slice(0, 80),
          title: typeof data.title === 'string' ? data.title : 'Shared graph view',
          nodeIds: data.nodeIds.filter((id) => id.length <= 300).slice(0, 80),
          positions,
          nodes,
          links,
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
    nodes: storedNodes(config.nodes),
    links: storedLinks(config.links),
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
    nodes: storedNodes(config.nodes),
    links: storedLinks(config.links),
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
      || (data.nodes !== undefined && !Array.isArray(data.nodes))
      || (data.links !== undefined && !Array.isArray(data.links))
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
    const nodes = parseSharedNodes(data.nodes)
    const links = parseSharedLinks(data.links)
    onChange({
      id: snap.id,
      ownerId: data.ownerId,
      ownerName: data.ownerName.slice(0, 80),
      classId,
      title: typeof data.title === 'string' ? data.title : 'Shared graph view',
      nodeIds: data.nodeIds.filter((id) => id.length <= 300).slice(0, 80),
      positions,
      nodes,
      links,
    })
  }, onError)
}

function parseSharedNodes(value: unknown): SharedGraphNode[] {
  if (!Array.isArray(value)) return []
  const nodes: SharedGraphNode[] = []
  for (const candidate of value.slice(0, 80)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const item = candidate as Record<string, unknown>
    if (
      typeof item.id !== 'string' || item.id.length > 300
      || typeof item.rawId !== 'string' || item.rawId.length > 300
      || !['note', 'learning', 'module', 'quiz', 'link'].includes(String(item.type))
      || typeof item.title !== 'string' || item.title.length > 500
      || typeof item.classId !== 'string' || item.classId.length > 150
      || typeof item.className !== 'string' || item.className.length > 120
      || typeof item.x !== 'number' || !Number.isFinite(item.x) || Math.abs(item.x) > 1500
      || typeof item.y !== 'number' || !Number.isFinite(item.y) || Math.abs(item.y) > 1500
    ) continue
    nodes.push({
      id: item.id,
      rawId: item.rawId,
      type: item.type as SharedGraphNode['type'],
      title: item.title,
      classId: item.classId,
      className: item.className,
      ...(typeof item.description === 'string' ? { description: item.description.slice(0, 2000) } : {}),
      ...(typeof item.content === 'string' ? { content: item.content.slice(0, 2000) } : {}),
      x: item.x,
      y: item.y,
      isFixed: item.isFixed === true,
    })
  }
  return nodes
}

function parseSharedLinks(value: unknown): SharedGraphLink[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 120).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const item = candidate as Record<string, unknown>
    return typeof item.id === 'string' && item.id.length <= 650
      && typeof item.source === 'string' && item.source.length <= 300
      && typeof item.target === 'string' && item.target.length <= 300
      ? [{ id: item.id, source: item.source, target: item.target }]
      : []
  })
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
  const code = createInviteCode()
  const expiresMs = inviteExpiryMs(expiry, Date.now())
  await setDoc(doc(db, ...graphSubPath(classId, graphId, 'invites'), token), {
    createdBy: ownerId,
    code,
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: expiresMs === null ? null : Timestamp.fromMillis(expiresMs),
  })
  await registerLearningInviteCode(code, {
    kind: 'graph',
    classId,
    itemId: graphId,
    inviteToken: token,
  }, ownerId, expiresMs === null ? null : Timestamp.fromMillis(expiresMs), db)
  return code
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
        code: typeof data.code === 'string' ? data.code : '',
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
