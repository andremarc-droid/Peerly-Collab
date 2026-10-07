import { doc, getDoc, serverTimestamp, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import { firestore } from '../../lib/firebase/firestore'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

export type LearningInviteKind = 'canvas' | 'flashcard' | 'graph' | 'tutor'

export type LearningInviteTarget =
  | { kind: 'canvas' | 'flashcard' | 'graph'; classId: string; itemId: string; inviteToken: string }
  | { kind: 'tutor'; itemId: string; inviteToken: string }

function learningInviteCodeRef(code: string, db: Firestore) {
  return doc(db, 'learningInviteCodes', code)
}

export function createInviteCode(): string {
  const code: string[] = []
  const randomUpperBound = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length
  while (code.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
    for (const byte of bytes) {
      if (byte < randomUpperBound) code.push(CODE_ALPHABET[byte % CODE_ALPHABET.length])
      if (code.length === CODE_LENGTH) break
    }
  }
  return code.join('')
}

export function normalizeLearningInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export async function registerLearningInviteCode(
  code: string,
  target: LearningInviteTarget,
  ownerId: string,
  expiresAt: Timestamp | null,
  db: Firestore = firestore,
): Promise<void> {
  const ref = learningInviteCodeRef(code, db)
  const existing = await getDoc(ref)
  if (existing.exists()) throw new Error('That invite code is already in use. Please create another invite.')
  await setDoc(ref, {
    ...target,
    ownerId,
    createdAt: serverTimestamp(),
    expiresAt,
  })
}

export async function findLearningInviteCode(
  input: string,
  db: Firestore = firestore,
): Promise<LearningInviteTarget> {
  const code = normalizeLearningInviteCode(input)
  if (!new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code)) {
    throw new Error('Enter a valid 8-character learning invite code.')
  }
  const snap = await getDoc(learningInviteCodeRef(code, db))
  if (!snap.exists()) throw new Error('That learning invite code was not found.')
  const data = snap.data()
  if (
    (data.kind !== 'canvas' && data.kind !== 'flashcard' && data.kind !== 'graph' && data.kind !== 'tutor')
    || typeof data.itemId !== 'string'
    || typeof data.inviteToken !== 'string'
    || (data.kind !== 'tutor' && typeof data.classId !== 'string')
    || (data.expiresAt instanceof Timestamp && data.expiresAt.toMillis() <= Date.now())
  ) {
    throw new Error('That learning invite code is invalid or has expired.')
  }
  let target: LearningInviteTarget
  if (data.kind === 'tutor') {
    if (typeof data.classId === 'string') throw new Error('That invite code is invalid.')
    target = { kind: data.kind, itemId: data.itemId, inviteToken: data.inviteToken }
  } else {
    if (typeof data.classId !== 'string') throw new Error('That invite code is missing its class.')
    target = {
      kind: data.kind,
      classId: data.classId,
      itemId: data.itemId,
      inviteToken: data.inviteToken,
    }
  }
  const inviteRef = target.kind === 'canvas'
    ? doc(db, 'classes', target.classId, 'learningCanvases', target.itemId, 'invites', target.inviteToken)
    : target.kind === 'flashcard'
      ? doc(db, 'classes', target.classId, 'flashcardDecks', target.itemId, 'invites', target.inviteToken)
      : target.kind === 'graph'
        ? doc(db, 'classes', target.classId, 'graphViews', target.itemId, 'invites', target.inviteToken)
        : doc(db, 'sharedTutorThreads', target.itemId, 'invites', target.inviteToken)
  if (target.kind !== 'flashcard') {
    const invite = await getDoc(inviteRef)
    if (
      !invite.exists()
      || invite.data().active !== true
      || invite.data().code !== code
      || (invite.data().expiresAt instanceof Timestamp && invite.data().expiresAt.toMillis() <= Date.now())
    ) {
      throw new Error('That invite code is no longer active.')
    }
  }
  return target
}
