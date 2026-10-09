import type { DriveFile } from '../types'
import { getDriveAccount, shareWithAnyone, shareWithUser, type DriveAccount } from './api'
import { forgetDriveToken, rememberChosenAccount, requestDriveToken } from './auth'
import type { DriveConfig } from './config'
import { DriveError } from './errors'
import { toDriveFile } from './files'
import { pickDocuments } from './picker'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, uploadFile } from './upload'

export interface ShareFailure {
  file: DriveFile
  error: DriveError
}

export interface UploadResult {
  uploaded: DriveFile[]
  failures: Array<{ name: string; message: string }>
}

/** Runs a Drive call with a token and, if Google says it expired, gets a fresh one and tries once more. */
async function withToken<T>(config: DriveConfig, run: (token: string) => Promise<T>, options: { selectAccount?: boolean } = {}): Promise<T> {
  const token = await requestDriveToken(config, options)
  try {
    return await run(token)
  } catch (error) {
    if (error instanceof DriveError && error.code === 'auth') {
      forgetDriveToken()
      return run(await requestDriveToken(config))
    }
    throw error
  }
}

export async function connectDriveAccount(config: DriveConfig, selectAccount = false): Promise<DriveAccount> {
  const account = await withToken(config, (token) => getDriveAccount(token), { selectAccount })
  // Choosing an account on purpose means later uploads should keep using it without asking again.
  if (selectAccount) rememberChosenAccount(account.email)
  return account
}

export async function pickDriveFiles(config: DriveConfig, max: number): Promise<DriveFile[]> {
  if (max < 1) return []
  return withToken(config, async (token) => {
    const documents = await pickDocuments(config, token, { multiple: max > 1 })
    return documents.slice(0, max).map(toDriveFile)
  })
}

/**
 * Saves local files into the person's own Drive, one at a time, and returns the stored references.
 * A file that fails is reported by name instead of cancelling the rest.
 */
export function uploadDriveFiles(config: DriveConfig, files: File[]): Promise<UploadResult> {
  return withToken(config, async (token) => {
    const result: UploadResult = { uploaded: [], failures: [] }
    for (const file of files) {
      if (file.size === 0) { result.failures.push({ name: file.name, message: 'The file is empty.' }); continue }
      if (file.size > MAX_UPLOAD_BYTES) { result.failures.push({ name: file.name, message: `The file is larger than ${MAX_UPLOAD_MB} MB.` }); continue }
      try {
        result.uploaded.push(toDriveFile(await uploadFile(file, token)))
      } catch (error) {
        // An expired token before anything was saved lets withToken refresh it and retry the whole batch.
        if (error instanceof DriveError && error.code === 'auth' && result.uploaded.length === 0) throw error
        result.failures.push({ name: file.name, message: error instanceof DriveError ? error.message : 'Google Drive returned an unexpected error.' })
      }
    }
    return result
  })
}

/**
 * Sets each file to "Anyone with the link can view". A file that cannot be shared (for example because a school
 * account blocks public links) is reported back instead of failing the whole batch.
 */
export function shareFilesWithAnyone(config: DriveConfig, files: DriveFile[]): Promise<ShareFailure[]> {
  return withToken(config, async (token) => {
    const failures: ShareFailure[] = []
    for (const file of files) {
      try {
        await shareWithAnyone(file.fileId, token)
      } catch (error) {
        if (error instanceof DriveError && error.code === 'auth') throw error
        failures.push({ file, error: error instanceof DriveError ? error : new DriveError('unknown') })
      }
    }
    return failures
  })
}

/** Shares every file with one person, view-only. Stops at the first file that cannot be shared and names it. */
export function shareFilesWithUser(config: DriveConfig, files: DriveFile[], emailAddress: string): Promise<void> {
  return withToken(config, async (token) => {
    for (const file of files) {
      try {
        await shareWithUser(file.fileId, emailAddress, token)
      } catch (error) {
        if (error instanceof DriveError && error.code === 'auth') throw error
        const reason = error instanceof DriveError ? error.message : 'Google Drive returned an unexpected error.'
        throw new DriveError(error instanceof DriveError ? error.code : 'unknown', `“${file.name}” could not be shared with your instructor. ${reason}`)
      }
    }
  })
}
