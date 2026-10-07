import { FirebaseError } from 'firebase/app'
import {
  collectionGroup,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { firestore } from '../../../lib/firebase/firestore'
import { MAX_DISPLAY_NAME } from './constants'
import { inviteStatus } from './inviteLink'
import { getInvite } from './inviteService'
import { memberRef, membersRef } from './paths'
import { isCollabRole, parseMember } from './schemas'
import type { CollabRole, MemberView, SharedCanvasRef } from './types'

export class InviteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InviteError'
  }
}

export function cleanDisplayName(name: string | null | undefined): string {
  return (name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME) || 'Learner'
}

interface AcceptInviteInput {
  classId: string
  canvasId: string
  token: string
  uid: string
  displayName: string | null | undefined
}

/**
 * Joins a canvas through an invite code and returns the role granted.
 * Someone who already joined keeps the role the owner gave them, whichever link they open.
 */
export async function acceptInvite(
  { classId, canvasId, token, uid, displayName }: AcceptInviteInput,
  db: Firestore = firestore,
): Promise<{ role: CollabRole; joined: boolean }> {
  const existing = await getDoc(memberRef(db, classId, canvasId, uid))
  if (existing.exists()) {
    const member = parseMember(uid, existing.data())
    if (member) return { role: member.role, joined: false }
  }

  const invite = await getInvite(classId, canvasId, token, db)
  if (!invite) throw new InviteError('This invite code is not valid.')
  const status = inviteStatus(invite, Date.now())
  if (status === 'off') throw new InviteError('The owner turned this invite code off.')
  if (status === 'expired') throw new InviteError('This invite code has expired. Ask the owner for a new one.')

  try {
    await setDoc(memberRef(db, classId, canvasId, uid), {
      uid,
      role: invite.role,
      displayName: cleanDisplayName(displayName),
      invitedBy: invite.createdBy,
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      throw new InviteError('You can only join canvases that belong to one of your own classes.')
    }
    throw error
  }
  return { role: invite.role, joined: true }
}

export async function setMemberRole(
  classId: string,
  canvasId: string,
  uid: string,
  role: CollabRole,
  db: Firestore = firestore,
): Promise<void> {
  await updateDoc(memberRef(db, classId, canvasId, uid), { role, updatedAt: serverTimestamp() })
}

export async function removeMember(
  classId: string,
  canvasId: string,
  uid: string,
  db: Firestore = firestore,
): Promise<void> {
  await deleteDoc(memberRef(db, classId, canvasId, uid))
}

export function watchMembers(
  classId: string,
  canvasId: string,
  onChange: (members: MemberView[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    membersRef(db, classId, canvasId),
    (snap) => {
      const members = snap.docs
        .map((d) => parseMember(d.id, d.data()))
        .filter((member): member is MemberView => member !== null)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
      onChange(members)
    },
    onError,
  )
}

/** Live role of one person on one canvas, or null when they are not invited (or were removed). */
export function watchMyRole(
  classId: string,
  canvasId: string,
  uid: string,
  onChange: (role: CollabRole | null) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    memberRef(db, classId, canvasId, uid),
    (snap) => {
      const role = snap.exists() ? snap.data().role : null
      onChange(isCollabRole(role) ? role : null)
    },
    onError,
  )
}

/** Canvases other people invited me to, found through the members collection group. */
export function watchSharedWithMe(
  uid: string,
  onChange: (items: SharedCanvasRef[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(
    query(collectionGroup(db, 'members'), where('uid', '==', uid)),
    (snap) => {
      const items: SharedCanvasRef[] = []
      for (const d of snap.docs) {
        const role = d.data().role
        const canvas = d.ref.parent.parent
        const classId = canvas?.parent.parent?.id
        if (!canvas || canvas.parent.id !== 'learningCanvases' || !classId || !isCollabRole(role)) continue
        items.push({ classId, canvasId: canvas.id, role })
      }
      onChange(items)
    },
    onError,
  )
}
