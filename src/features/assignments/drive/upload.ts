import { toDriveError } from './api'
import { DriveError } from './errors'
import type { PickerDocument } from './files'

const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const SESSION_HOST = 'https://www.googleapis.com/'

/** A sanity cap so a huge file cannot freeze the browser tab. Drive itself allows far more. */
export const MAX_UPLOAD_MB = 100
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

interface ErrorBody { error?: { message?: string; errors?: Array<{ reason?: string }> } }

async function failure(response: Response): Promise<DriveError> {
  let body: ErrorBody | null = null
  try { body = (await response.json()) as ErrorBody } catch { body = null }
  if (body?.error?.errors?.[0]?.reason === 'storageQuotaExceeded') {
    return new DriveError('unknown', 'Your Google Drive storage is full, so this file could not be saved. Free up space in Drive and try again.')
  }
  return toDriveError(response.status, body)
}

/**
 * Saves one local file into the signed-in person's own Google Drive (My Drive) using Google's resumable upload.
 * The file goes straight from the browser to Google. It never passes through this app's servers or Firebase.
 */
export async function uploadFile(file: File, token: string, fetchImpl: typeof fetch = fetch): Promise<PickerDocument> {
  const mimeType = file.type || 'application/octet-stream'
  let start: Response
  try {
    start = await fetchImpl(`${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent('id,name,mimeType')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: file.name.slice(0, 200), mimeType }),
    })
  } catch { throw new DriveError('network') }
  if (!start.ok) throw await failure(start)

  const session = start.headers.get('Location')
  // The upload address must be Google's. Never send a person's file anywhere else.
  if (!session || !session.startsWith(SESSION_HOST)) throw new DriveError('unknown', 'Google Drive did not start the upload. Try again in a moment.')

  let done: Response
  try { done = await fetchImpl(session, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file }) } catch { throw new DriveError('network') }
  if (!done.ok) throw await failure(done)
  return (await done.json()) as PickerDocument
}
