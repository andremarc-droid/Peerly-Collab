import { describe, expect, it } from 'vitest'
import { canConfirmAccountDeletion, emailsMatch } from './accountDeletionRules'

describe('emailsMatch', () => {
  it('matches the exact email', () => {
    expect(emailsMatch('ada@example.com', 'ada@example.com')).toBe(true)
  })

  it('ignores case and surrounding spaces', () => {
    expect(emailsMatch('  Ada@Example.COM ', 'ada@example.com')).toBe(true)
  })

  it('rejects a different or partial email', () => {
    expect(emailsMatch('ada@example.org', 'ada@example.com')).toBe(false)
    expect(emailsMatch('ada@example', 'ada@example.com')).toBe(false)
    expect(emailsMatch('', 'ada@example.com')).toBe(false)
  })

  it('never matches when the account has no email', () => {
    expect(emailsMatch('', null)).toBe(false)
    expect(emailsMatch('', undefined)).toBe(false)
    expect(emailsMatch('anything', '   ')).toBe(false)
  })
})

describe('canConfirmAccountDeletion', () => {
  const base = { typedEmail: 'ada@example.com', accountEmail: 'ada@example.com', needsPassword: false, password: '' }

  it('allows deletion once the email matches for a Google account', () => {
    expect(canConfirmAccountDeletion(base)).toBe(true)
  })

  it('blocks deletion while the email does not match', () => {
    expect(canConfirmAccountDeletion({ ...base, typedEmail: 'ada@exam' })).toBe(false)
  })

  it('also needs a password for password accounts', () => {
    expect(canConfirmAccountDeletion({ ...base, needsPassword: true })).toBe(false)
    expect(canConfirmAccountDeletion({ ...base, needsPassword: true, password: 'secret123' })).toBe(true)
  })

  it('still needs the email even when the password is entered', () => {
    expect(canConfirmAccountDeletion({ ...base, typedEmail: '', needsPassword: true, password: 'secret123' })).toBe(false)
  })
})
