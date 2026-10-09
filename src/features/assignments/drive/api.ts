import { DriveError } from './errors'

const API_BASE = 'https://www.googleapis.com/drive/v3'

interface ErrorBody {
  error?: { message?: string; errors?: Array<{ reason?: string }> }
}

const RATE_LIMIT_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'sharingRateLimitExceeded', 'quotaExceeded']

export function toDriveError(status: number, body: ErrorBody | null): DriveError {
  const reason = body?.error?.errors?.[0]?.reason ?? ''
  if (status === 401) return new DriveError('auth')
  if (status === 429 || RATE_LIMIT_REASONS.includes(reason)) return new DriveError('rate_limited')
  if (status === 403) return new DriveError('forbidden')
  if (status === 404) return new DriveError('not_found')
  return new DriveError('unknown')
}

async function request(url: string, token: string, init: { method: 'GET' | 'POST'; body?: unknown }, fetchImpl: typeof fetch): Promise<Response> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: init.method,
      headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new DriveError('network')
  }
  if (!response.ok) {
    let body: ErrorBody | null = null
    try { body = (await response.json()) as ErrorBody } catch { body = null }
    throw toDriveError(response.status, body)
  }
  return response
}

export interface DriveAccount {
  email: string
  name: string
}

/** The Google account behind the token. This is the address student work will be shared with. */
export async function getDriveAccount(token: string, fetchImpl: typeof fetch = fetch): Promise<DriveAccount> {
  const url = `${API_BASE}/about?fields=${encodeURIComponent('user(emailAddress,displayName)')}`
  const response = await request(url, token, { method: 'GET' }, fetchImpl)
  const data = (await response.json()) as { user?: { emailAddress?: unknown; displayName?: unknown } }
  const email = typeof data.user?.emailAddress === 'string' ? data.user.emailAddress.trim() : ''
  if (!email) throw new DriveError('unknown', 'Google did not share an email address for this account. Try a different account.')
  return { email, name: typeof data.user?.displayName === 'string' ? data.user.displayName : email }
}

/** "Anyone with the link can view": link-only, not discoverable by search. */
export async function shareWithAnyone(fileId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = `${API_BASE}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`
  await request(url, token, { method: 'POST', body: { type: 'anyone', role: 'reader', allowFileDiscovery: false } }, fetchImpl)
}

/** View-only access for one person, without sending them a notification email. */
export async function shareWithUser(fileId: string, emailAddress: string, token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = `${API_BASE}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`
  await request(url, token, { method: 'POST', body: { type: 'user', role: 'reader', emailAddress } }, fetchImpl)
}
