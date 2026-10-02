interface FirebaseErrorLike {
  code?: unknown
}

const messages: Record<string, string> = {
  'auth/wrong-password': 'That password is incorrect. Try again or reset it.',
  'auth/user-not-found': 'We couldn’t find an account with that email.',
  'auth/invalid-credential': 'That email and password combination doesn’t match an account.',
  'auth/email-already-in-use': 'An account already uses this email. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a little while, then try again.',
  'auth/network-request-failed': 'We couldn’t connect. Check your internet connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before sign-in finished.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
  'auth/cancelled-popup-request': 'A Google sign-in window is already open. Finish that one first.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact your instructor or support.',
}

export function mapFirebaseAuthError(error: unknown): string {
  const code = (error as FirebaseErrorLike | null)?.code
  if (typeof code === 'string' && messages[code]) return messages[code]
  return 'We couldn’t complete that request. Please try again.'
}
