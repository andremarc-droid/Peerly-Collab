/** Email addresses are not case sensitive, and people often paste with stray spaces. */
export function emailsMatch(typed: string, accountEmail: string | null | undefined): boolean {
  const expected = accountEmail?.trim().toLowerCase()
  return Boolean(expected) && typed.trim().toLowerCase() === expected
}

interface DeletionConfirmation {
  typedEmail: string
  accountEmail: string | null | undefined
  /** Password accounts must also enter their password. */
  needsPassword: boolean
  password: string
}

/** The Delete button stays disabled until the typed email matches (and the password is given, if needed). */
export function canConfirmAccountDeletion({ typedEmail, accountEmail, needsPassword, password }: DeletionConfirmation): boolean {
  if (!emailsMatch(typedEmail, accountEmail)) return false
  return !needsPassword || password.length > 0
}
