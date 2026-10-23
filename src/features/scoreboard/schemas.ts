const RESERVED_NAMES = new Set(['admin', 'administrator', 'peerly', 'moderator', 'system', 'root', 'staff'])

const PROFANITY_PATTERN = /(fuck|shit|bitch|asshole|cunt|nigger|faggot|dick|pussy|bastard)/i

export function validateScoreboardDisplayName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (trimmed.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters.' }
  }
  if (trimmed.length > 30) {
    return { valid: false, error: 'Display name must be 30 characters or less.' }
  }
  if (RESERVED_NAMES.has(trimmed.toLowerCase())) {
    return { valid: false, error: 'This display name is reserved. Please choose another.' }
  }
  if (PROFANITY_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Display name contains inappropriate language.' }
  }
  return { valid: true }
}

export function isUnder18DefaultOff(role?: string | null, age?: number | null): boolean {
  if (role === 'student' && typeof age === 'number' && age < 18) {
    return false // Under 18 student defaults to OFF (false)
  }
  return true // Adult or instructor defaults to ON (true)
}
