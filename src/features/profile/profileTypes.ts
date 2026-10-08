import type { UserRole } from '../auth/roleIntent'

export interface UserProfile {
  uid: string
  name: string
  email: string | null
  photoURL: string | null
  role: UserRole | null
  /** Students only; entered at sign-up. Private: never copied to the public profile. */
  age?: number | null
  createdAt: number
  updatedAt: number
}

export interface PublicProfile {
  name: string
  photoURL: string | null
  updatedAt: number
}

export function resolveProfileRole(existingRole: UserRole | null | undefined, chosenRole: UserRole | null): UserRole | null {
  return existingRole ?? chosenRole
}

/** Returns the age to store: students only, whole number in range; an existing valid age is never overwritten. */
export function resolveProfileAge(
  role: UserRole | null,
  existingAge: unknown,
  chosenAge: number | null | undefined,
): number | null {
  if (role !== 'student') return null
  const isValid = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 5 && value <= 120
  if (isValid(existingAge)) return existingAge
  return isValid(chosenAge) ? chosenAge : null
}

export function getRoleMismatch(chosenRole: UserRole | null, existingRole: UserRole | null): UserRole | null {
  return chosenRole && existingRole && chosenRole !== existingRole ? existingRole : null
}
