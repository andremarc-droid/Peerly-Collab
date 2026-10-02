import type { UserRole } from '../auth/roleIntent'

export interface UserProfile {
  uid: string
  name: string
  email: string | null
  photoURL: string | null
  role: UserRole | null
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

export function getRoleMismatch(chosenRole: UserRole | null, existingRole: UserRole | null): UserRole | null {
  return chosenRole && existingRole && chosenRole !== existingRole ? existingRole : null
}
