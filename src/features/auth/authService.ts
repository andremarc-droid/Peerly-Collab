import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import { auth } from '../../lib/firebase/auth'

export async function prepareLocalAuthPersistence(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence)
}

export function watchAuthState(callback: (user: User | null) => void, onError: (error: unknown) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback, onError)
}

export async function completeGoogleRedirect(): Promise<void> {
  await getRedirectResult(auth)
}

export async function createEmailAccount(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(user, { displayName: name.trim() })
  let verificationError: unknown = null
  try {
    await sendEmailVerification(user)
  } catch (error) {
    verificationError = error
  }
  return { user, verificationError }
}

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  try {
    return await signInWithPopup(auth, provider)
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'auth/popup-blocked') throw error
    await signInWithRedirect(auth, provider)
    return null
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user)
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth)
}
