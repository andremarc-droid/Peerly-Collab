import type { Location } from 'react-router-dom'
import type { UserRole } from '../features/auth/roleIntent'

export const AUTH_RETURN_TO_KEY = 'coollab:authReturnTo'

export function dashboardPath(role: UserRole): string {
  return role === 'instructor' ? '/instructor' : '/student'
}

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (value.startsWith('/signin') || value.startsWith('/signup') || value.startsWith('/role')) return null
  return value
}

export function locationPath(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function returnPathFromState(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('from' in state)) return null
  const from = state.from
  if (typeof from === 'string') return safeInternalPath(from)
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return null
  const pathname = from.pathname
  const search = 'search' in from && typeof from.search === 'string' ? from.search : ''
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : ''
  return safeInternalPath(`${String(pathname)}${search}${hash}`)
}

export function rememberReturnTo(path: string | null): void {
  if (path) window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, path)
}

export function readReturnTo(): string | null {
  return safeInternalPath(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY))
}

export function clearReturnTo(): void {
  window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
}

export function consumeReturnTo(state: unknown, role: UserRole): string {
  const path = returnPathFromState(state) ?? readReturnTo() ?? dashboardPath(role)
  clearReturnTo()
  return path
}
