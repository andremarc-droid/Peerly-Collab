import type { User } from 'firebase/auth'
import { deleteAuthAccount, reauthenticateForSensitiveAction } from '../auth/authService'
import type { UserRole } from '../auth/roleIntent'
import { clearAccountDeleted, markAccountDeleted } from './accountDeletionState'

interface DeleteAccountInput {
  user: User
  role: UserRole | null
  /** Needed only for email and password accounts. */
  password: string
}

/**
 * 1. Confirm it's really them (before anything is deleted, so a wrong password destroys nothing).
 * 2. Delete their data.
 * 3. Delete their sign-in.
 *
 * The data step is loaded after the confirmation so a Google popup still counts as a direct click.
 */
export async function deleteAccount({ user, role, password }: DeleteAccountInput): Promise<void> {
  await reauthenticateForSensitiveAction(user, password)
  const { deleteAccountData } = await import('./accountData')
  await deleteAccountData(user.uid, role)
  // Signing out follows right away, so flag it first: the app then sends the person to the landing page.
  markAccountDeleted()
  try {
    await deleteAuthAccount(user)
  } catch (error) {
    clearAccountDeleted()
    throw error
  }
}
