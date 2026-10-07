import {
  deleteDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import type { InviteExpiryOption } from './constants'
import { generateInviteToken, inviteExpiryMs } from './inviteLink'
import { inviteRef, invitesRef } from './paths'
import { parseInvite } from './schemas'
import type { CollabRole, InviteView } from './types'
import { createInviteCode, registerLearningInviteCode } from '../../learningSharing/inviteCodes'

/** Creates an invite code and returns it. Only the canvas owner is allowed to (enforced by rules). */
export async function createInvite(
  classId: string,
  canvasId: string,
  ownerUid: string,
  role: CollabRole,
  expiry: InviteExpiryOption,
  db: Firestore = firestore,
): Promise<string> {
  const token = generateInviteToken()
  const code = createInviteCode()
  const expiresMs = inviteExpiryMs(expiry, Date.now())
  await setDoc(inviteRef(db, classId, canvasId, token), {
    createdBy: ownerUid,
    code,
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: expiresMs === null ? null : Timestamp.fromMillis(expiresMs),
  })
  await registerLearningInviteCode(code, {
    kind: 'canvas',
    classId,
    itemId: canvasId,
    inviteToken: token,
  }, ownerUid, expiresMs === null ? null : Timestamp.fromMillis(expiresMs), db)
  return code
}

/** Turning a link off stops new people joining. People who already joined keep their access. */
export async function setInviteActive(
  classId: string,
  canvasId: string,
  token: string,
  active: boolean,
  db: Firestore = firestore,
): Promise<void> {
  await updateDoc(inviteRef(db, classId, canvasId, token), { active })
}

export async function deleteInvite(
  classId: string,
  canvasId: string,
  token: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(inviteRef(db, classId, canvasId, token))
}

/** Looks one invite up by its token. Returns null when it does not exist or is malformed. */
export async function getInvite(
  classId: string,
  canvasId: string,
  token: string,
  db: Firestore = firestore,
): Promise<InviteView | null> {
  const snap = await getDoc(inviteRef(db, classId, canvasId, token))
  return snap.exists() ? parseInvite(snap.id, snap.data()) : null
}

export function watchInvites(
  classId: string,
  canvasId: string,
  onChange: (invites: InviteView[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    invitesRef(db, classId, canvasId),
    (snap) => {
      const invites = snap.docs
        .map((d) => parseInvite(d.id, d.data()))
        .filter((invite): invite is InviteView => invite !== null)
        .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0))
      onChange(invites)
    },
    onError,
  )
}
