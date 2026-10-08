/**
 * Deleting an account removes the profile document before the sign-in. Without this flag the profile
 * listener would see the document vanish and send the person to the role screen halfway through.
 * While it is set, profile updates are ignored so the Profile page stays put until the sign-in is gone.
 */
let deleting = false

export function beginAccountDeletion(): void {
  deleting = true
}

export function endAccountDeletion(): void {
  deleting = false
}

export function isAccountDeletionInProgress(): boolean {
  return deleting
}

/**
 * Set just before the sign-in itself is deleted. When the person is signed out right after, the route
 * guards send them to the landing page instead of the sign-in screen. It is cleared if the delete fails
 * and whenever someone signs in again.
 */
let accountDeleted = false

export function markAccountDeleted(): void {
  accountDeleted = true
}

export function clearAccountDeleted(): void {
  accountDeleted = false
}

export function wasAccountDeleted(): boolean {
  return accountDeleted
}

/** Where a signed-out person on a private page should go. */
export function signedOutRedirectPath(): string {
  return accountDeleted ? '/' : '/role?mode=signin'
}
