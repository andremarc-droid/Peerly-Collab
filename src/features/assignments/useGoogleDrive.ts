import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { setAppAccountHint, getCachedToken } from './drive/auth'
import {
  connectDriveAccount, DriveError, getDriveConfig, getDriveConfigIssue, pickDriveFiles, preloadGoogleScripts,
  shareFilesWithAnyone, shareFilesWithUser, uploadDriveFiles, type DriveAccount, type ShareFailure, type UploadResult,
} from './drive'
import type { DriveFile } from './types'

export interface GoogleDriveApi {
  /** Why Drive cannot be used (missing environment variables), or null when it is ready. */
  configIssue: string | null
  busy: boolean
  connect: (selectAccount?: boolean) => Promise<DriveAccount>
  /** True when a valid Google token is already held in memory, so no sign-in window is needed. */
  hasSession: () => boolean
  pick: (max: number) => Promise<DriveFile[]>
  /** Saves files from the person's computer into their own Google Drive and returns the stored references. */
  upload: (files: File[]) => Promise<UploadResult>
  shareWithAnyone: (files: DriveFile[]) => Promise<ShareFailure[]>
  shareWithUser: (files: DriveFile[], email: string) => Promise<void>
}

export function useGoogleDrive(): GoogleDriveApi {
  const { user } = useAuth()
  const configIssue = useMemo(() => getDriveConfigIssue(), [])
  const [pending, setPending] = useState(0)

  // The email this person signed in to the app with becomes Google's default account choice.
  const appEmail = user?.email ?? null
  useEffect(() => { setAppAccountHint(appEmail) }, [appEmail])

  useEffect(() => { if (!configIssue) preloadGoogleScripts() }, [configIssue])

  return useMemo<GoogleDriveApi>(() => {
    const config = () => {
      if (configIssue) throw new DriveError('not_configured', configIssue)
      return getDriveConfig()
    }
    async function track<T>(run: () => Promise<T>): Promise<T> {
      setPending((value) => value + 1)
      try { return await run() } finally { setPending((value) => value - 1) }
    }
    return {
      configIssue,
      busy: pending > 0,
      connect: (selectAccount = false) => track(() => connectDriveAccount(config(), selectAccount)),
      hasSession: () => getCachedToken() !== null,
      pick: (max) => track(() => pickDriveFiles(config(), max)),
      upload: (files) => track(() => uploadDriveFiles(config(), files)),
      shareWithAnyone: (files) => track(() => shareFilesWithAnyone(config(), files)),
      shareWithUser: (files, email) => track(() => shareFilesWithUser(config(), files, email)),
    }
  }, [configIssue, pending])
}
