import type { DriveConfig } from './config'
import { DriveError } from './errors'
import { loadGoogleIdentity } from './loadScripts'

/**
 * drive.file is Google's narrow, non-sensitive Drive scope: the app can only touch files a person
 * explicitly picks (or that the app created). It never gets access to the rest of their Drive.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const EXPIRY_MARGIN_MS = 60_000
const FALLBACK_LIFETIME_SECONDS = 3000

/** Held in memory only. It is never written to localStorage, Firestore or any cookie. */
let session: { token: string; expiresAt: number } | null = null

export function getCachedToken(now: number = Date.now()): string | null {
  if (!session || session.expiresAt - EXPIRY_MARGIN_MS <= now) return null
  return session.token
}

export function setSessionForTests(value: { token: string; expiresAt: number } | null): void { session = value }

/** Drops the cached token (for example after Google answered 401). Does not revoke the person's consent. */
export function forgetDriveToken(): void { session = null }

/** Drops the token and asks Google to revoke this app's access for the signed-in Google account. */
export function disconnectDrive(): void {
  const token = session?.token
  session = null
  if (token) window.google?.accounts?.oauth2?.revoke(token)
}

export async function requestDriveToken(config: DriveConfig, options: { selectAccount?: boolean } = {}): Promise<string> {
  if (!options.selectAccount) {
    const cached = getCachedToken()
    if (cached) return cached
  }
  await loadGoogleIdentity()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new DriveError('script')
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new DriveError(response.error === 'access_denied' ? 'cancelled' : 'auth', response.error_description))
          return
        }
        const seconds = Number(response.expires_in)
        session = { token: response.access_token, expiresAt: Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_LIFETIME_SECONDS) * 1000 }
        resolve(response.access_token)
      },
      error_callback: (error) => {
        if (error.type === 'popup_closed') { reject(new DriveError('cancelled')); return }
        reject(new DriveError('auth', error.type === 'popup_failed_to_open' ? 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.' : undefined))
      },
    })
    client.requestAccessToken({ prompt: options.selectAccount ? 'select_account' : '' })
  })
}
