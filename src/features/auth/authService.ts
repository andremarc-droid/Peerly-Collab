import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getAdditionalUserInfo,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth'
import { auth } from '../../lib/firebase/auth'
import { AccountNotRegisteredError } from './authErrors'
import { beginSignInCheck } from './signInGate'
import { isGoogleSigninOnly, markAccountNotRegistered, setGoogleSigninOnly } from './notRegisteredMark'

export async function prepareLocalAuthPersistence(): Promise<void> {
  await setPersistence(auth, browserLocalPersistence)
}

export function watchAuthState(callback: (user: User | null) => void, onError: (error: unknown) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback, onError)
}

/** Removes an account Firebase just created for someone who never registered. */
async function discardNewAccount(user: User): Promise<void> {
  try {
    await deleteUser(user)
  } catch {
    try {
      await signOut(auth)
    } catch {
      // Nothing more we can do; the caller still reports the account as unregistered.
    }
  }
}

async function rejectIfNewAccount(result: UserCredential): Promise<void> {
  if (!getAdditionalUserInfo(result)?.isNewUser) return
  await discardNewAccount(result.user)
  throw new AccountNotRegisteredError()
}

/** Finishes a redirect-based Google sign-in. Returns true when it was rejected as unregistered. */
export async function completeGoogleRedirect(): Promise<boolean> {
  const signinOnly = isGoogleSigninOnly()
  try {
    const result = await getRedirectResult(auth)
    if (!result || !signinOnly || !getAdditionalUserInfo(result)?.isNewUser) return false
    await discardNewAccount(result.user)
    markAccountNotRegistered()
    return true
  } finally {
    setGoogleSigninOnly(false)
  }
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

interface GoogleSignInOptions {
  /** Sign in page: only accept Google accounts that are already registered. */
  requireExistingAccount?: boolean
}

export async function signInWithGoogle({ requireExistingAccount = false }: GoogleSignInOptions = {}) {
  const provider = new GoogleAuthProvider()
  const endCheck = requireExistingAccount ? beginSignInCheck() : () => {}
  try {
    let result: UserCredential
    try {
      result = await signInWithPopup(auth, provider)
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== 'auth/popup-blocked') throw error
      setGoogleSigninOnly(requireExistingAccount)
      await signInWithRedirect(auth, provider)
      return null
    }
    if (requireExistingAccount) await rejectIfNewAccount(result)
    return result
  } finally {
    endCheck()
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

/** True when the account signs in with an email and password, so deleting it needs the password. */
export function hasPasswordProvider(user: User): boolean {
  return user.providerData.some((provider) => provider.providerId === 'password')
}

/**
 * Firebase only lets a recently signed-in person delete their account. Password accounts confirm
 * with their password; Google accounts confirm in a Google popup.
 */
export async function reauthenticateForSensitiveAction(user: User, password: string): Promise<void> {
  if (!hasPasswordProvider(user)) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider())
    return
  }
  if (!user.email) throw Object.assign(new Error('This account has no email address.'), { code: 'auth/invalid-email' })
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
}

export async function deleteAuthAccount(user: User): Promise<void> {
  await deleteUser(user)
}
