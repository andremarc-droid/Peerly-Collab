export type DriveErrorCode =
  | 'not_configured'
  | 'cancelled'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'network'
  | 'unsupported'
  | 'script'
  | 'unknown'

const defaultMessages: Record<DriveErrorCode, string> = {
  not_configured: 'Google Drive is not set up for this app yet.',
  cancelled: 'Google Drive access was cancelled.',
  auth: 'Your Google Drive session expired. Connect again and retry.',
  forbidden: 'Google Drive would not let this file be shared. Your account or school may restrict sharing, or you may not be allowed to share this file.',
  not_found: 'This file could not be found in Google Drive, or this app was not given access to it. Pick the file again.',
  rate_limited: 'Google Drive is busy right now. Wait a moment and try again.',
  network: 'Could not reach Google Drive. Check your connection and try again.',
  unsupported: 'This kind of Google Drive item cannot be used here.',
  script: 'Google’s sign-in or file picker could not be loaded. Check your connection or any content blockers and try again.',
  unknown: 'Google Drive returned an unexpected error. Try again in a moment.',
}

export class DriveError extends Error {
  code: DriveErrorCode
  constructor(code: DriveErrorCode, message?: string) {
    super(message ?? defaultMessages[code])
    this.name = 'DriveError'
    this.code = code
  }
}

/** A message safe to show people. `silent` is true when they closed a Google window on purpose. */
export function describeDriveError(reason: unknown, fallback = 'Something went wrong with Google Drive.'): { message: string; silent: boolean } {
  if (reason instanceof DriveError) return { message: reason.message, silent: reason.code === 'cancelled' }
  return { message: reason instanceof Error && reason.message ? reason.message : fallback, silent: false }
}
