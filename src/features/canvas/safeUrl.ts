/**
 * Safe link handling for canvas cards.
 *
 * Card links can be written by students (blank boards) and are later opened by
 * instructors, so a link is only ever rendered as clickable when it passes this
 * check. Anything else must be shown as plain text with a "Link blocked" label.
 */
export const MAX_SAFE_URL_LENGTH = 500

/**
 * Returns the trimmed URL when it is a well-formed, credential-free https URL
 * of at most 500 characters. Returns null for everything else (http,
 * javascript:, data:, vbscript:, relative paths, URLs with whitespace or
 * embedded credentials, non-strings).
 */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_SAFE_URL_LENGTH) return null
  if (/\s/.test(trimmed)) return null
  if (!/^https:\/\//i.test(trimmed)) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:') return null
  if (parsed.username !== '' || parsed.password !== '') return null
  if (parsed.hostname === '') return null
  return trimmed
}
