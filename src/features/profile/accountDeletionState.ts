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
