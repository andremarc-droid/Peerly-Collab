import { afterEach, describe, expect, it } from 'vitest'
import {
  checkJoinLookupCooldown, clearJoinLookupFailures, generateJoinCode, isValidJoinCode,
  JOIN_CODE_ALPHABET, normalizeJoinCode, recordJoinLookupFailure,
} from './index'

afterEach(() => {
  clearJoinLookupFailures('cooldown-test')
  clearJoinLookupFailures('window-test')
})

describe('class join codes', () => {
  it('normalizes display codes and rejects ambiguous or malformed characters', () => {
    expect(normalizeJoinCode(' ab-c 23 ')).toBe('ABC23')
    expect(isValidJoinCode('abc234')).toBe(true)
    expect(isValidJoinCode('ABCIO1')).toBe(false)
    expect(isValidJoinCode('ABCDE')).toBe(false)
  })

  it('generates six characters from the unambiguous alphabet', () => {
    const code = generateJoinCode((bytes) => {
      bytes.fill(0)
      return bytes
    })
    expect(code).toBe(JOIN_CODE_ALPHABET[0].repeat(6))
    expect(isValidJoinCode(code)).toBe(true)
  })

  it('applies an in-memory cooldown after five failures and clears it on success', () => {
    for (let index = 0; index < 5; index += 1) recordJoinLookupFailure('cooldown-test', 1000 + index)
    expect(checkJoinLookupCooldown('cooldown-test', 1005).allowed).toBe(false)
    expect(checkJoinLookupCooldown('cooldown-test', 1005).retryAfterMs).toBeGreaterThan(0)
    expect(checkJoinLookupCooldown('cooldown-test', 1000 + 10 * 60 * 1000 + 10).allowed).toBe(true)
    recordJoinLookupFailure('cooldown-test', 20_000_000)
    clearJoinLookupFailures('cooldown-test')
    expect(checkJoinLookupCooldown('cooldown-test', 20_000_001).allowed).toBe(true)
  })

  it('drops failures outside its ten-minute lookup window', () => {
    for (let index = 0; index < 4; index += 1) recordJoinLookupFailure('window-test', index)
    recordJoinLookupFailure('window-test', 10 * 60 * 1000 + 1)
    expect(checkJoinLookupCooldown('window-test', 10 * 60 * 1000 + 2).allowed).toBe(true)
  })
})
