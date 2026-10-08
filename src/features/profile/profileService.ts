import { doc, onSnapshot, runTransaction } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { firestore } from '../../lib/firebase/firestore'
import type { PublicProfile, UserProfile } from './profileTypes'
import { resolveProfileRole } from './profileTypes'
import type { UserRole } from '../auth/roleIntent'

function safeName(user: User, existingName?: string): string {
  return user.displayName?.trim() || existingName?.trim() || user.email?.split('@')[0] || 'User'
}

export async function ensureUserProfile(user: User, chosenRole: UserRole | null): Promise<UserProfile> {
  const userRef = doc(firestore, 'users', user.uid)
  const publicRef = doc(firestore, 'publicProfiles', user.uid)
  const now = Date.now()

  return runTransaction(firestore, async (transaction) => {
    const [userSnapshot, publicSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(publicRef),
    ])
    const existing = userSnapshot.exists() ? userSnapshot.data() : undefined
    const name = safeName(user, existing?.name)
    const photoURL = user.photoURL ?? existing?.photoURL ?? null
    const role = resolveProfileRole(existing?.role as UserRole | null | undefined, chosenRole)
    const createdAt = typeof existing?.createdAt === 'number' ? existing.createdAt : now
    const profile: UserProfile = {
      uid: existing?.uid ?? user.uid,
      name,
      email: existing?.email ?? user.email,
      photoURL,
      role,
      createdAt,
      updatedAt: now,
    }

    if (userSnapshot.exists()) {
      transaction.set(userRef, {
        name,
        photoURL,
        updatedAt: now,
        ...(existing?.role == null && chosenRole ? { role: chosenRole } : {}),
      }, { merge: true })
    } else {
      transaction.set(userRef, profile)
    }

    const publicProfile: PublicProfile = {
      name,
      photoURL,
      updatedAt: now,
    }
    if (publicSnapshot.exists()) transaction.set(publicRef, publicProfile, { merge: true })
    else transaction.set(publicRef, publicProfile)
    return profile
  })
}

export async function updateProfileName(uid: string, name: string): Promise<void> {
  const userRef = doc(firestore, 'users', uid)
  const publicRef = doc(firestore, 'publicProfiles', uid)
  const updatedAt = Date.now()
  await runTransaction(firestore, async (transaction) => {
    const [userSnapshot, publicSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(publicRef),
    ])
    if (userSnapshot.exists()) transaction.set(userRef, { name, updatedAt }, { merge: true })
    if (publicSnapshot.exists()) transaction.set(publicRef, { name, updatedAt }, { merge: true })
  })
}

export function watchUserProfile(
  uid: string,
  onProfile: (profile: UserProfile | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(doc(firestore, 'users', uid), (snapshot) => {
    if (!snapshot.exists()) {
      onProfile(null)
      return
    }
    onProfile({ ...snapshot.data(), uid: snapshot.id } as UserProfile)
  }, onError)
}

export function watchPublicProfile(
  uid: string,
  onProfile: (profile: PublicProfile | null) => void,
  onError: (error: Error) => void,
): () => void {
  return onSnapshot(publicRef(uid), (snapshot) => {
    if (!snapshot.exists()) {
      onProfile(null)
      return
    }
    const data = snapshot.data()
    const name = typeof data.name === 'string' ? data.name.trim() : ''
    const photoURL = data.photoURL === null || typeof data.photoURL === 'string' ? data.photoURL : null
    onProfile(name ? { name, photoURL, updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0 } : null)
  }, onError)
}

function publicRef(uid: string) {
  return doc(firestore, 'publicProfiles', uid)
}
