import {
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
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'
import {
  tutorActivityRef,
  tutorInviteRef,
  tutorInvitesRef,
  tutorMemberRef,
  tutorMembersGroupRef,
  tutorMembersRef,
  tutorPresenceRef,
  tutorRevokedInviteRef,
  tutorThreadsRef,
} from './sharedPaths'
import type { SharedTutorRef, TutorActivity, TutorShareInvite, TutorShareMember, TutorShareRole } from './sharedTypes'

function safeName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Learner'
}

function timestampMs(value: unknown): number | null {
  return value instanceof Timestamp ? value.toMillis() : null
}

export function inviteRole(value: unknown): value is TutorShareRole {
  return value === 'viewer' || value === 'editor'
}

export async function createTutorInvite(
  threadId: string,
  uid: string,
  role: TutorShareRole,
  durationDays: number | null,
  db: Firestore = firestore,
): Promise<string> {
  const inviteToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
  const expiresAt = durationDays === null ? null : Timestamp.fromMillis(Date.now() + durationDays * 86_400_000)
  await setDoc(tutorInviteRef(db, threadId, inviteToken), {
    createdBy: uid,
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt,
  })
  return inviteToken
}

export async function acceptTutorInvite(
  threadId: string,
  inviteToken: string,
  uid: string,
  displayName: string | null | undefined,
  db: Firestore = firestore,
): Promise<TutorShareRole> {
  const existing = await getDoc(tutorMemberRef(db, threadId, uid))
  if (existing.exists() && inviteRole(existing.data().role)) return existing.data().role
  const inviteSnap = await getDoc(tutorInviteRef(db, threadId, inviteToken))
  if (!inviteSnap.exists()) throw new Error('This conversation invite is not valid.')
  const invite = inviteSnap.data()
  if (invite.active !== true) throw new Error('The owner turned this invite off.')
  if (invite.expiresAt instanceof Timestamp && invite.expiresAt.toMillis() <= Date.now()) {
    throw new Error('This conversation invite has expired.')
  }
  if (!inviteRole(invite.role) || typeof invite.createdBy !== 'string') {
    throw new Error('This conversation invite is invalid.')
  }
  const revoked = await getDoc(tutorRevokedInviteRef(db, threadId, uid, inviteToken))
  if (revoked.exists()) throw new Error('The owner revoked your access to this invite.')
  await setDoc(tutorMemberRef(db, threadId, uid), {
    uid,
    role: invite.role,
    displayName: safeName(displayName),
    invitedBy: invite.createdBy,
    grantedByToken: inviteToken,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await writeActivity(threadId, uid, safeName(displayName), 'Joined the conversation.', db)
  return invite.role
}

export async function setTutorMemberRole(threadId: string, uid: string, role: TutorShareRole, db: Firestore = firestore) {
  await updateDoc(tutorMemberRef(db, threadId, uid), { role, updatedAt: serverTimestamp() })
}

export async function removeTutorMember(threadId: string, ownerId: string, uid: string, db: Firestore = firestore) {
  const memberRef = tutorMemberRef(db, threadId, uid)
  const member = await getDoc(memberRef)
  const token = member.data()?.grantedByToken
  if (member.exists() && typeof token === 'string' && token.length === 32) {
    const revokedRef = tutorRevokedInviteRef(db, threadId, uid, token)
    if (!(await getDoc(revokedRef)).exists()) {
      await setDoc(revokedRef, {
        uid,
        inviteToken: token,
        revokedBy: ownerId,
        revokedAt: serverTimestamp(),
      })
    }
  }
  await deleteDoc(memberRef)
  await deleteDoc(tutorPresenceRef(db, threadId, uid))
}

export async function setTutorInviteActive(threadId: string, inviteToken: string, active: boolean, db: Firestore = firestore) {
  await updateDoc(tutorInviteRef(db, threadId, inviteToken), { active })
}

export function watchTutorMembers(
  threadId: string,
  onChange: (members: TutorShareMember[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
): Unsubscribe {
  return onSnapshot(tutorMembersRef(db, threadId), (snap) => {
    const members = snap.docs.flatMap((item) => {
      const data = item.data()
      if (!inviteRole(data.role) || typeof data.displayName !== 'string') return []
      return [{ uid: item.id, role: data.role, displayName: data.displayName }]
    })
    onChange(members)
  }, onError)
}

export function watchTutorInvites(
  threadId: string,
  onChange: (invites: TutorShareInvite[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
): Unsubscribe {
  return onSnapshot(tutorInvitesRef(db, threadId), (snap) => {
    const invites = snap.docs.flatMap((item) => {
      const data = item.data()
      if (!inviteRole(data.role)) return []
      return [{
        token: item.id,
        role: data.role,
        active: data.active === true,
        expiresAtMs: timestampMs(data.expiresAt),
        createdAtMs: timestampMs(data.createdAt),
      }]
    })
    onChange(invites)
  }, onError)
}

export function watchTutorActivity(
  threadId: string,
  onChange: (activity: TutorActivity[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
): Unsubscribe {
  return onSnapshot(query(tutorActivityRef(db, threadId), orderBy('createdAt', 'desc'), limit(20)), (snap) => {
    const activity = snap.docs.flatMap((item) => {
      const data = item.data()
      if (typeof data.actorId !== 'string' || typeof data.actorName !== 'string' || typeof data.summary !== 'string') return []
      return [{ id: item.id, actorId: data.actorId, actorName: data.actorName, summary: data.summary, createdAtMs: timestampMs(data.createdAt) }]
    })
    onChange(activity)
  }, onError)
}

export async function writeActivity(threadId: string, uid: string, name: string, summary: string, db: Firestore = firestore) {
  const ref = doc(tutorActivityRef(db, threadId), crypto.randomUUID())
  await setDoc(ref, { actorId: uid, actorName: safeName(name), summary: summary.slice(0, 200), createdAt: serverTimestamp() })
}

export function watchAccessibleTutorThreads(
  uid: string,
  onChange: (refs: SharedTutorRef[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
): Unsubscribe {
  const owned = new Map<string, SharedTutorRef>()
  const joined = new Map<string, SharedTutorRef>()
  let ownersReady = false
  let membersReady = false
  const publish = () => {
    if (!ownersReady || !membersReady) return
    const all = new Map(owned)
    joined.forEach((ref, id) => {
      if (!all.has(id)) all.set(id, ref)
    })
    onChange([...all.values()])
  }
  const ownersUnsub = onSnapshot(query(tutorThreadsRef(db), where('ownerId', '==', uid)), (snap) => {
    ownersReady = true
    owned.clear()
    for (const item of snap.docs) owned.set(item.id, { threadId: item.id, role: 'owner', ownerId: uid })
    publish()
  }, onError)
  const membersUnsub = onSnapshot(query(tutorMembersGroupRef(db), where('uid', '==', uid)), (snap) => {
    membersReady = true
    joined.clear()
    for (const item of snap.docs) {
      const thread = item.ref.parent.parent
      const role = item.data().role
      if (thread && inviteRole(role)) joined.set(thread.id, { threadId: thread.id, role, ownerId: '' })
    }
    publish()
  }, onError)
  return () => {
    ownersUnsub()
    membersUnsub()
  }
}

export function buildTutorInviteUrl(origin: string, threadId: string, inviteToken: string): string {
  return `${origin}/learning/tutor/${encodeURIComponent(threadId)}/${encodeURIComponent(inviteToken)}`
}
