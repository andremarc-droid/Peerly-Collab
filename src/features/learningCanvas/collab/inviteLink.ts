import { INVITE_TOKEN_BYTES, INVITE_TOKEN_LENGTH, type InviteExpiryOption } from './constants'
import type { InviteView } from './types'

/** URL-safe base64 without padding. 24 random bytes become exactly 32 characters. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Unguessable invite token from Web Crypto (never Math.random). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(INVITE_TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

const TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${INVITE_TOKEN_LENGTH}}$`)

export function isValidInviteToken(token: string): boolean {
  return TOKEN_PATTERN.test(token)
}

export function inviteExpiryMs(option: InviteExpiryOption, nowMs: number): number | null {
  if (option === 'never') return null
  return nowMs + Number(option) * 24 * 60 * 60 * 1000
}

export type InviteStatus = 'active' | 'expired' | 'off'

/** "off" means the owner switched the link off; "expired" means its date passed. */
export function inviteStatus(invite: Pick<InviteView, 'active' | 'expiresAtMs'>, nowMs: number): InviteStatus {
  if (!invite.active) return 'off'
  if (invite.expiresAtMs !== null && invite.expiresAtMs <= nowMs) return 'expired'
  return 'active'
}

export function invitePath(classId: string, canvasId: string, token: string): string {
  return `/learning/join/${encodeURIComponent(classId)}/${encodeURIComponent(canvasId)}/${encodeURIComponent(token)}`
}

export function buildInviteUrl(origin: string, classId: string, canvasId: string, token: string): string {
  return `${origin}${invitePath(classId, canvasId, token)}`
}
