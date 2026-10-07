import { FirebaseError } from 'firebase/app'
import {
  addDoc,
  collectionGroup,
  deleteDoc,
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
import { firestore } from '../../lib/firebase/firestore'
import { INVITE_TOKEN_BYTES, INVITE_TOKEN_LENGTH } from '../learningCanvas/collab/constants'
import { inviteExpiryMs, inviteStatus } from '../learningCanvas/collab/inviteLink'
import type { InviteExpiryOption } from '../learningCanvas/collab/constants'
import { cleanDisplayName } from '../learningCanvas/collab/memberService'
import {
  deckActivityRef,
  deckInviteRef,
  deckInvitesRef,
  deckMemberRef,
  deckMembersRef,
  deckPresenceRecordRef,
  deckPresenceRef,
  flashcardDeckRef,
} from './paths'
import { parseFlashcardDeck } from './schemas'
import type { FlashcardDeckWithId } from './types'

export interface DeckInvite {
  token: string
  role: 'viewer' | 'editor'
  active: boolean
  expiresAtMs: number | null
}

export interface DeckMember {
  uid: string
  role: 'viewer' | 'editor'
  name: string
}

export interface DeckActivity {
  id: string
  actorName: string
  type: 'edit' | 'member'
  summary: string
  createdAtMs: number | null
}

function makeToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseInvite(token: string, raw: Record<string, unknown>): DeckInvite | null {
  if ((raw.role !== 'viewer' && raw.role !== 'editor') || typeof raw.active !== 'boolean') return null
  const expiresAt = raw.expiresAt
  return {
    token,
    role: raw.role,
    active: raw.active,
    expiresAtMs: expiresAt instanceof Timestamp ? expiresAt.toMillis() : null,
  }
}

export async function createDeckInvite(
  classId: string,
  deckId: string,
  ownerId: string,
  role: 'viewer' | 'editor',
  expiry: InviteExpiryOption,
  db: Firestore = firestore,
): Promise<string> {
  const token = makeToken()
  const expiresMs = inviteExpiryMs(expiry, Date.now())
  await setDoc(deckInviteRef(db, classId, deckId, token), {
    createdBy: ownerId,
    role,
    active: true,
    createdAt: serverTimestamp(),
    expiresAt: expiresMs === null ? null : Timestamp.fromMillis(expiresMs),
  })
  return token
}

export async function acceptDeckInvite(
  classId: string,
  deckId: string,
  token: string,
  uid: string,
  displayName: string | null | undefined,
  db: Firestore = firestore,
): Promise<boolean> {
  if (!new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`).test(token)) {
    throw new Error('This flashcard invite link is not valid.')
  }
  const memberRef = deckMemberRef(db, classId, deckId, uid)
  const member = await getDoc(memberRef)
  if (member.exists()) return false
  const inviteSnap = await getDoc(deckInviteRef(db, classId, deckId, token))
  if (!inviteSnap.exists()) throw new Error('This flashcard invite link is not valid.')
  const invite = parseInvite(token, inviteSnap.data())
  if (!invite) throw new Error('This flashcard invite link is not valid.')
  const status = inviteStatus(invite, Date.now())
  if (status === 'off') throw new Error('The owner turned this invite link off.')
  if (status === 'expired') throw new Error('This flashcard invite link has expired.')
  try {
    await setDoc(memberRef, {
      uid,
      role: invite.role,
      displayName: cleanDisplayName(displayName),
      invitedBy: inviteSnap.data().createdBy,
      grantedByToken: token,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return true
  } catch (cause) {
    if (cause instanceof FirebaseError && cause.code === 'permission-denied') {
      throw new Error('You must be an active member of this class to join a shared deck.', { cause })
    }
    throw cause
  }
}

export function watchDeckInvites(
  classId: string,
  deckId: string,
  onChange: (invites: DeckInvite[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(deckInvitesRef(db, classId, deckId), (snapshot) => {
    onChange(snapshot.docs
      .map((item) => parseInvite(item.id, item.data()))
      .filter((item): item is DeckInvite => item !== null))
  }, onError)
}

export function watchDeckMembers(
  classId: string,
  deckId: string,
  onChange: (members: DeckMember[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(deckMembersRef(db, classId, deckId), (snapshot) => {
    const members = snapshot.docs.flatMap((item): DeckMember[] => {
      const data = item.data()
      return (data.role === 'viewer' || data.role === 'editor') && typeof data.displayName === 'string'
        ? [{ uid: item.id, role: data.role, name: data.displayName }]
        : []
    })
    onChange(members)
  }, onError)
}

export function watchDeckPresence(
  classId: string,
  deckId: string,
  onChange: (presence: Map<string, number>) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(deckPresenceRef(db, classId, deckId), (snapshot) => {
    const presence = new Map<string, number>()
    for (const item of snapshot.docs) {
      const data = item.data()
      const timestamp = data.lastActive
      if (data.online === true && timestamp instanceof Timestamp) presence.set(item.id, timestamp.toMillis())
    }
    onChange(presence)
  }, onError)
}

export function watchDeckActivity(
  classId: string,
  deckId: string,
  onChange: (activity: DeckActivity[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  return onSnapshot(query(deckActivityRef(db, classId, deckId), orderBy('createdAt', 'desc'), limit(30)), (snapshot) => {
    onChange(snapshot.docs.map((item) => {
      const data = item.data()
      const createdAt = data.createdAt
      return {
        id: item.id,
        actorName: typeof data.actorName === 'string' ? data.actorName : 'Learner',
        type: data.type === 'member' ? 'member' : 'edit',
        summary: typeof data.summary === 'string' ? data.summary : 'Updated this deck',
        createdAtMs: createdAt instanceof Timestamp ? createdAt.toMillis() : null,
      }
    }))
  }, onError)
}

export function logDeckActivity(
  classId: string,
  deckId: string,
  actor: { uid: string; name: string },
  summary: string,
  type: 'edit' | 'member' = 'edit',
  db: Firestore = firestore,
) {
  return addDoc(deckActivityRef(db, classId, deckId), {
    actorId: actor.uid,
    actorName: cleanDisplayName(actor.name),
    type,
    summary: summary.slice(0, 200),
    createdAt: serverTimestamp(),
  })
}

export function writeDeckPresence(
  classId: string,
  deckId: string,
  uid: string,
  name: string,
  online: boolean,
  db: Firestore = firestore,
) {
  return setDoc(deckPresenceRecordRef(db, classId, deckId, uid), {
    uid,
    name: cleanDisplayName(name),
    online,
    lastActive: serverTimestamp(),
  })
}

export function changeDeckMemberRole(
  classId: string,
  deckId: string,
  uid: string,
  role: 'viewer' | 'editor',
  db: Firestore = firestore,
) {
  return updateDoc(deckMemberRef(db, classId, deckId, uid), { role, updatedAt: serverTimestamp() })
}

export function removeDeckMember(classId: string, deckId: string, uid: string, db: Firestore = firestore) {
  return deleteDoc(deckMemberRef(db, classId, deckId, uid))
}

export function changeDeckInvite(
  classId: string,
  deckId: string,
  token: string,
  active: boolean,
  db: Firestore = firestore,
) {
  return updateDoc(deckInviteRef(db, classId, deckId, token), { active })
}

export function deleteDeckInvite(classId: string, deckId: string, token: string, db: Firestore = firestore) {
  return deleteDoc(deckInviteRef(db, classId, deckId, token))
}

export function watchSharedDecks(
  uid: string,
  onChange: (decks: FlashcardDeckWithId[]) => void,
  onError: (error: Error) => void,
  db: Firestore = firestore,
) {
  let generation = 0
  return onSnapshot(query(collectionGroup(db, 'members'), where('uid', '==', uid)), (snapshot) => {
    const currentGeneration = ++generation
    const deckMembers = snapshot.docs.flatMap((member) => {
      const deck = member.ref.parent.parent
      const classDoc = deck?.parent.parent
      return deck?.parent.id === 'flashcardDecks' && classDoc
        ? [{ classId: classDoc.id, deckId: deck.id, role: member.data().role }]
        : []
    })
    void Promise.all(deckMembers.map(async ({ classId, deckId, role }) => {
      if (role !== 'viewer' && role !== 'editor') return null
      try {
        const deckSnapshot = await getDoc(flashcardDeckRef(db, classId, deckId))
        if (!deckSnapshot.exists()) return null
        const deck = parseFlashcardDeck(deckSnapshot.data())
        return { deck: { ...deck, id: deckSnapshot.id, sharedRole: role }, error: null }
      } catch (cause) {
        return {
          deck: null,
          error: cause instanceof Error ? cause : new Error('Could not load a shared deck.'),
        }
      }
    })).then((results) => {
      if (currentGeneration !== generation) return
      const failures = results.filter((result) => result && result.error).map((result) => result?.error)
      onChange(results.flatMap((result) => result?.deck ? [result.deck] : []))
      if (failures.length > 0) onError(failures[0] ?? new Error('Could not load a shared deck.'))
    }, (cause: unknown) => {
      if (currentGeneration === generation) onError(cause instanceof Error ? cause : new Error('Could not load shared decks.'))
    })
  }, onError)
}
