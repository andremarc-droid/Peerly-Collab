import { createSign, generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { TokenError, authFailureReason, verifyFirebaseTokenWithKeys } from './aiChat.js'

const PROJECT = 'demo-project'
const NOW_MS = 1_800_000_000_000
const NOW = Math.floor(NOW_MS / 1000)

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const keys = { 'key-1': publicPem }

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

function sign(claims: Record<string, unknown>, options: { kid?: string; alg?: string; privateKey?: typeof pair.privateKey } = {}) {
  const head = b64({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'key-1', typ: 'JWT' })
  const body = b64(claims)
  const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(options.privateKey ?? pair.privateKey).toString('base64url')
  return `${head}.${body}.${signature}`
}

const goodClaims = {
  iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'user-1', iat: NOW - 60, auth_time: NOW - 60, exp: NOW + 3000,
  firebase: { sign_in_provider: 'google.com' },
}

const reasonOf = (run: () => unknown) => {
  try { run() } catch (error) { return error instanceof TokenError ? error.reason : `not-a-token-error: ${String(error)}` }
  return 'accepted'
}

describe('verifyFirebaseTokenWithKeys', () => {
  it('accepts a correctly signed token for this project and returns the uid', () => {
    const decoded = verifyFirebaseTokenWithKeys(sign(goodClaims), keys, PROJECT, NOW_MS)
    expect(decoded.uid).toBe('user-1')
    expect((decoded.firebase as { sign_in_provider: string }).sign_in_provider).toBe('google.com')
  })

  it('rejects an expired token', () => {
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign({ ...goodClaims, exp: NOW - 1 }), keys, PROJECT, NOW_MS))).toBe('token-expired')
  })

  it('rejects a token from another Firebase project (audience or issuer)', () => {
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign({ ...goodClaims, aud: 'other-project' }), keys, PROJECT, NOW_MS))).toBe('wrong-firebase-project')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign({ ...goodClaims, iss: 'https://securetoken.google.com/other-project' }), keys, PROJECT, NOW_MS))).toBe('wrong-firebase-project')
  })

  it('rejects a token whose payload was changed after signing', () => {
    const [head, , signature] = sign(goodClaims).split('.')
    const forged = `${head}.${b64({ ...goodClaims, sub: 'someone-else' })}.${signature}`
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(forged, keys, PROJECT, NOW_MS))).toBe('bad-signature')
  })

  it('rejects a token signed with a different private key', () => {
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign(goodClaims, { privateKey: otherPair.privateKey }), keys, PROJECT, NOW_MS))).toBe('bad-signature')
  })

  it('rejects unknown key ids and non-RS256 algorithms', () => {
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign(goodClaims, { kid: 'nope' }), keys, PROJECT, NOW_MS))).toBe('unknown-signing-key')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign(goodClaims, { alg: 'none' }), keys, PROJECT, NOW_MS))).toBe('bad-algorithm')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(`${b64({ alg: 'none' })}.${b64(goodClaims)}.`, keys, PROJECT, NOW_MS))).toBe('malformed-token')
  })

  it('rejects malformed tokens and tokens from the future or without a subject', () => {
    expect(reasonOf(() => verifyFirebaseTokenWithKeys('not-a-token', keys, PROJECT, NOW_MS))).toBe('malformed-token')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys('a.b.c.d', keys, PROJECT, NOW_MS))).toBe('malformed-token')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign({ ...goodClaims, iat: NOW + 3600 }), keys, PROJECT, NOW_MS))).toBe('token-not-yet-valid')
    expect(reasonOf(() => verifyFirebaseTokenWithKeys(sign({ ...goodClaims, sub: '' }), keys, PROJECT, NOW_MS))).toBe('bad-subject')
  })

  it('reports the reason through authFailureReason', () => {
    expect(authFailureReason(new TokenError('token-expired', 'x'))).toBe('token-expired')
  })
})
