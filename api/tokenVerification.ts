import type { DecodedIdToken } from 'firebase-admin/auth'
import { X509Certificate, createPublicKey, createVerify } from 'node:crypto'

let firebaseInitialized = false
/** The Firebase project of the service account this server started with. */
let serverProjectId: string | null = null

export function getServerProjectId(): string | null {
  return serverProjectId
}

export function resetFirebaseInitializedForTest() {
  firebaseInitialized = false
  serverProjectId = null
}

export async function ensureFirebase(): Promise<void> {
  if (firebaseInitialized) return
  const { getApps, initializeApp, cert } = await import('firebase-admin/app')
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing on server.')
    }
    let clean = raw
    if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
      clean = clean.slice(1, -1).trim()
    }
    try {
      const jsonStr = clean.startsWith('{') ? clean : Buffer.from(clean, 'base64').toString('utf-8')
      const credentials = JSON.parse(jsonStr) as Record<string, unknown>
      serverProjectId = typeof credentials.project_id === 'string' ? credentials.project_id : null
      if (typeof credentials.private_key === 'string') {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n')
      }
      initializeApp({ credential: cert(credentials) })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err)
      throw new Error(`FIREBASE_SERVICE_ACCOUNT invalid: ${msg}`)
    }
  } else {
    if (!serverProjectId) {
      serverProjectId = process.env.FIREBASE_PROJECT_ID?.trim() ?? process.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? null
    }
  }
  firebaseInitialized = true
}

/** Errors that mean a library could not be LOADED on this server (as opposed to the token being bad). */
export function isModuleLoadError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return (
    code === 'ERR_REQUIRE_ESM' ||
    code === 'ERR_REQUIRE_ASYNC_MODULE' ||
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  )
}

/** A token that failed verification. `reason` is a fixed label that is safe to send to the browser. */
export class TokenError extends Error {
  readonly reason: string
  constructor(reason: string, message: string) {
    super(message)
    this.name = 'TokenError'
    this.reason = reason
  }
}

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
let certCache: { keys: Record<string, string>; expiresAtMs: number } | null = null

export async function googleCerts(nowMs: number): Promise<Record<string, string>> {
  if (certCache && certCache.expiresAtMs > nowMs) return certCache.keys
  const response = await fetch(GOOGLE_CERTS_URL)
  if (!response.ok) throw new TokenError('certs-unavailable', `Google signing keys could not be fetched (${response.status}).`)
  const keys = (await response.json()) as Record<string, string>
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600)
  certCache = { keys, expiresAtMs: nowMs + maxAge * 1000 }
  return keys
}

/**
 * Checks a Firebase ID token the way Firebase documents it: RS256 signature against Google's published keys, then the
 * expiry, audience (this project), issuer and subject claims. Uses only Node's built-in crypto, no extra libraries.
 */
export function verifyFirebaseTokenWithKeys(
  token: string,
  keys: Record<string, string>,
  projectId: string,
  nowMs: number,
): Record<string, unknown> & { uid: string } {
  const [headerPart, payloadPart, signaturePart, extra] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart || extra !== undefined) throw new TokenError('malformed-token', 'The token is not a JWT.')
  let header: { alg?: unknown; kid?: unknown }
  let claims: Record<string, unknown>
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: unknown; kid?: unknown }
    claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    throw new TokenError('malformed-token', 'The token could not be decoded.')
  }
  if (header.alg !== 'RS256') throw new TokenError('bad-algorithm', 'The token is not signed with RS256.')
  const pem = typeof header.kid === 'string' ? keys[header.kid] : undefined
  if (!pem) throw new TokenError('unknown-signing-key', 'The token was signed with an unknown key.')
  let signatureValid = false
  try {
    const publicKey = pem.includes('BEGIN CERTIFICATE') ? new X509Certificate(pem).publicKey : createPublicKey(pem)
    signatureValid = createVerify('RSA-SHA256').update(`${headerPart}.${payloadPart}`).verify(publicKey, Buffer.from(signaturePart, 'base64url'))
  } catch {
    signatureValid = false
  }
  if (!signatureValid) throw new TokenError('bad-signature', 'The token signature is not valid.')

  const nowSec = Math.floor(nowMs / 1000)
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) throw new TokenError('token-expired', 'The token has expired.')
  if (typeof claims.iat !== 'number' || claims.iat > nowSec + 60) throw new TokenError('token-not-yet-valid', 'The token was issued in the future.')
  if (typeof claims.auth_time !== 'number' || claims.auth_time > nowSec + 60) throw new TokenError('token-not-yet-valid', 'The token auth_time is in the future.')
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new TokenError('wrong-firebase-project', 'The token belongs to a different Firebase project.')
  if (typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) throw new TokenError('bad-subject', 'The token has no valid subject.')
  return { ...claims, uid: claims.sub }
}

export async function verifyFirebaseIdTokenDirect(token: string): Promise<DecodedIdToken> {
  const projectId = serverProjectId ?? process.env.FIREBASE_PROJECT_ID?.trim() ?? process.env.VITE_FIREBASE_PROJECT_ID?.trim()
  if (!projectId) throw new TokenError('server-project-unknown', 'The server does not know its Firebase project id.')
  const nowMs = Date.now()
  try {
    return verifyFirebaseTokenWithKeys(token, await googleCerts(nowMs), projectId, nowMs) as unknown as DecodedIdToken
  } catch (err) {
    // Google rotates its signing keys: if this key id is new, fetch the list once more.
    if (err instanceof TokenError && err.reason === 'unknown-signing-key' && certCache) {
      certCache = null
      return verifyFirebaseTokenWithKeys(token, await googleCerts(nowMs), projectId, nowMs) as unknown as DecodedIdToken
    }
    throw err
  }
}

export async function verifyAuthToken(
  token: string,
  options: { checkRevoked?: boolean; anonymousErrorMsg?: string } = {},
): Promise<DecodedIdToken> {
  const checkRevoked = options.checkRevoked ?? true
  let decodedToken: DecodedIdToken
  try {
    const { getAuth } = await import('firebase-admin/auth')
    if (checkRevoked) {
      try {
        decodedToken = await getAuth().verifyIdToken(token, true)
      } catch (verifyErr) {
        // If checking revocation failed because the service account doesn't have Identity Toolkit permission
        // or Identity Toolkit API is disabled, fall back to verification without revocation check.
        const code = (verifyErr as { code?: string })?.code || ''
        const msg = verifyErr instanceof Error ? verifyErr.message : ''
        const isPermError = code === 'auth/insufficient-permission' || /permission|identitytoolkit|not been used|disabled/i.test(msg)
        if (isPermError) {
          console.warn('Revocation check not permitted for this service account; falling back to standard verification:', msg)
          decodedToken = await getAuth().verifyIdToken(token, false)
        } else {
          throw verifyErr
        }
      }
    } else {
      decodedToken = await getAuth().verifyIdToken(token, false)
    }
  } catch (err) {
    // firebase-admin's token checker failed to LOAD on this server (not a bad token), so check the signature directly.
    if (!isModuleLoadError(err)) throw err
    console.warn('firebase-admin/auth could not load; verifying the ID token directly:', err instanceof Error ? err.message : String(err))
    decodedToken = await verifyFirebaseIdTokenDirect(token)
  }
  if (decodedToken.firebase?.sign_in_provider === 'anonymous') {
    const err = new Error(options.anonymousErrorMsg ?? 'Anonymous accounts are not permitted.')
    ;(err as unknown as { code: string }).code = 'auth/anonymous-not-allowed'
    throw err
  }
  return decodedToken
}

/**
 * Why a Firebase ID token was rejected, in a form that is safe to show: a fixed label, never the raw error message.
 * 'wrong-firebase-project' means the server's service account belongs to a different Firebase project than the web app.
 */
export function authFailureReason(err: unknown): string {
  if (err instanceof TokenError) return err.reason
  const code = typeof (err as { code?: unknown } | null)?.code === 'string' ? (err as { code: string }).code : ''
  const message = err instanceof Error ? err.message : ''
  if (/incorrect "(aud|iss)"/i.test(message)) return 'wrong-firebase-project'
  if (code === 'auth/id-token-expired') return 'token-expired'
  if (code === 'auth/id-token-revoked') return 'token-revoked'
  if (code === 'auth/user-disabled') return 'user-disabled'
  if (code === 'auth/insufficient-permission' || /permission|identitytoolkit|not been used|disabled/i.test(message)) return 'service-account-permission'
  return code.replace(/^auth\//, '') || 'unknown'
}
