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
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
  type Unsubscribe,
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { auth } from '../../lib/firebase/auth'
import { firebaseConfig } from '../../lib/firebase/config'
import { AccountNotRegisteredError } from './authErrors'
import { getGoogleAuthErrorDetails, reportGoogleAuthDiagnostic } from './googleAuthDiagnostics'
import { beginSignInCheck } from './signInGate'
import { isGoogleSigninOnly, markAccountNotRegistered, setGoogleSigninOnly } from './notRegisteredMark'

export async function prepareLocalAuthPersistence(): Promise<void> {
  if (!Capacitor.isNativePlatform()) await setPersistence(auth, browserLocalPersistence)
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
  if (Capacitor.isNativePlatform()) return false
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
  provider.setCustomParameters({ prompt: 'select_account' })
  const endCheck = requireExistingAccount ? beginSignInCheck() : () => {}
  try {
    if (Capacitor.isNativePlatform()) {
      reportGoogleAuthDiagnostic({
        step: 'Native Google sign-in started',
        status: 'info',
        message: `Firebase project configured: ${Boolean(firebaseConfig.projectId)}; auth domain configured: ${Boolean(firebaseConfig.authDomain)}.`,
      })
      let nativeResult: Awaited<ReturnType<typeof FirebaseAuthentication.signInWithGoogle>>
      try {
        nativeResult = await FirebaseAuthentication.signInWithGoogle()
      } catch (error) {
        reportGoogleAuthDiagnostic({
          step: 'Native Google sign-in',
          status: 'error',
          ...getGoogleAuthErrorDetails(error),
        })
        throw error
      }
      const idToken = nativeResult.credential?.idToken
      reportGoogleAuthDiagnostic({
        step: 'Google ID token returned',
        status: idToken ? 'success' : 'error',
        message: idToken ? 'An ID token was returned. Its value is hidden.' : 'No ID token was returned by the native Google sign-in provider.',
      })
      if (!idToken) {
        const error = Object.assign(new Error('Google sign-in returned no ID token.'), { code: 'app/missing-google-id-token' })
        reportGoogleAuthDiagnostic({ step: 'Firebase credential exchange', status: 'error', code: error.code, message: error.message })
        throw error
      }
      let result: UserCredential
      try {
        result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken))
        reportGoogleAuthDiagnostic({ step: 'Firebase credential exchange', status: 'success', message: 'Firebase accepted the Google credential.' })
      } catch (error) {
        reportGoogleAuthDiagnostic({
          step: 'Firebase credential exchange',
          status: 'error',
          ...getGoogleAuthErrorDetails(error),
        })
        throw error
      }
      if (requireExistingAccount) await rejectIfNewAccount(result)
      return result
    }

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

export async function refreshEmailVerificationStatus(user: User): Promise<boolean> {
  await reload(user)
  return user.emailVerified
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
