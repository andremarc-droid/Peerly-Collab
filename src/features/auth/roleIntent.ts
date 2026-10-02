export type UserRole = 'student' | 'instructor'
export type RoleIntentMode = 'signup' | 'signin' | 'continue'

export interface RoleIntent {
  role: UserRole
  mode: RoleIntentMode
}

export const ROLE_INTENT_STORAGE_KEY = 'coollab:roleIntent'

export function saveRoleIntent(intent: RoleIntent, storage: Storage = window.sessionStorage): void {
  storage.setItem(ROLE_INTENT_STORAGE_KEY, JSON.stringify(intent))
}

export function clearRoleIntent(storage: Storage = window.sessionStorage): void {
  storage.removeItem(ROLE_INTENT_STORAGE_KEY)
}

export function readRoleIntent(storage: Storage = window.sessionStorage): RoleIntent | null {
  const storedValue = storage.getItem(ROLE_INTENT_STORAGE_KEY)
  if (!storedValue) return null

  try {
    const intent: unknown = JSON.parse(storedValue)
    if (!isRoleIntent(intent)) {
      storage.removeItem(ROLE_INTENT_STORAGE_KEY)
      return null
    }
    return intent
  } catch {
    storage.removeItem(ROLE_INTENT_STORAGE_KEY)
    return null
  }
}

function isRoleIntent(value: unknown): value is RoleIntent {
  if (typeof value !== 'object' || value === null) return false
  const intent = value as Record<string, unknown>
  return (intent.role === 'student' || intent.role === 'instructor')
    && (intent.mode === 'signup' || intent.mode === 'signin' || intent.mode === 'continue')
}
