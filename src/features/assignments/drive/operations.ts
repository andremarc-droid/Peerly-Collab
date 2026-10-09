import type { DriveFile } from '../types'
import { getDriveAccount, shareWithAnyone, shareWithUser, type DriveAccount } from './api'
import { forgetDriveToken, requestDriveToken } from './auth'
import type { DriveConfig } from './config'
import { DriveError } from './errors'
import { toDriveFile } from './files'
import { pickDocuments } from './picker'

export interface ShareFailure {
  file: DriveFile
  error: DriveError
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

export function connectDriveAccount(config: DriveConfig, selectAccount = false): Promise<DriveAccount> {
  return withToken(config, (token) => getDriveAccount(token), { selectAccount })
}

export async function pickDriveFiles(config: DriveConfig, max: number): Promise<DriveFile[]> {
  if (max < 1) return []
  return withToken(config, async (token) => {
    const documents = await pickDocuments(config, token, { multiple: max > 1 })
    return documents.slice(0, max).map(toDriveFile)
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
