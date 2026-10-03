export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const JOIN_CODE_LENGTH = 6
export const JOIN_CODE_LOOKUP_LIMIT = 5
export const JOIN_CODE_WINDOW_MS = 10 * 60 * 1000

export function normalizeJoinCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '')
}

export function isValidJoinCode(value: string): boolean {
  const normalized = normalizeJoinCode(value)
  return normalized.length === JOIN_CODE_LENGTH && [...normalized].every((character) => JOIN_CODE_ALPHABET.includes(character))
}

export function generateJoinCode(randomValues: (values: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (values) => {
  globalThis.crypto.getRandomValues(values)
  return values
}): string {
  const length = JOIN_CODE_ALPHABET.length
  const ceiling = Math.floor(256 / length) * length
  let code = ''
  while (code.length < JOIN_CODE_LENGTH) {
    const bytes = randomValues(new Uint8Array(new ArrayBuffer((JOIN_CODE_LENGTH - code.length) * 2)))
    for (const byte of bytes) {
      if (byte >= ceiling) continue
      code += JOIN_CODE_ALPHABET[byte % length]
      if (code.length === JOIN_CODE_LENGTH) break
    }
  }
  return code
}

interface FailureWindow { timestamps: number[]; cooldownUntil: number }
const failureWindows = new Map<string, FailureWindow>()

function activeWindow(key: string, now: number): FailureWindow {
  const window = failureWindows.get(key) ?? { timestamps: [], cooldownUntil: 0 }
  window.timestamps = window.timestamps.filter((timestamp) => now - timestamp < JOIN_CODE_WINDOW_MS)
  if (now >= window.cooldownUntil) window.cooldownUntil = 0
  if (!window.timestamps.length && !window.cooldownUntil) failureWindows.delete(key)
  else failureWindows.set(key, window)
  return window
}

export function checkJoinLookupCooldown(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number; message: string | null } {
  const window = activeWindow(key, now)
  if (window.cooldownUntil <= now) return { allowed: true, retryAfterMs: 0, message: null }
  return { allowed: false, retryAfterMs: window.cooldownUntil - now, message: 'Too many unsuccessful code lookups. Please wait a few minutes before trying again.' }
}

export function recordJoinLookupFailure(key: string, now = Date.now()): void {
  const window = activeWindow(key, now)
  window.timestamps.push(now)
  if (window.timestamps.length >= JOIN_CODE_LOOKUP_LIMIT) window.cooldownUntil = now + JOIN_CODE_WINDOW_MS
  failureWindows.set(key, window)
}

export function clearJoinLookupFailures(key: string): void {
  failureWindows.delete(key)
}
