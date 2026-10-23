export const GROUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const GROUP_CODE_LENGTH = 6
export const MAX_GROUP_MEMBERS = 50

export function generateGroupInviteCode(): string {
  const code: string[] = []
  const randomUpperBound = Math.floor(256 / GROUP_CODE_ALPHABET.length) * GROUP_CODE_ALPHABET.length
  while (code.length < GROUP_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(GROUP_CODE_LENGTH))
    for (const byte of bytes) {
      if (byte < randomUpperBound) code.push(GROUP_CODE_ALPHABET[byte % GROUP_CODE_ALPHABET.length])
      if (code.length === GROUP_CODE_LENGTH) break
    }
  }
  return code.join('')
}

export function normalizeGroupInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

export function validateGroupName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { valid: false, error: 'Group name is required.' }
  if (trimmed.length > 80) return { valid: false, error: 'Group name must be 80 characters or less.' }
  return { valid: true }
}

export function validateGroupDescription(desc?: string): { valid: boolean; error?: string } {
  if (!desc) return { valid: true }
  if (desc.trim().length > 300) {
    return { valid: false, error: 'Description must be 300 characters or less.' }
  }
  return { valid: true }
}
