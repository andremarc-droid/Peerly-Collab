import { useEffect, useMemo, useState } from 'react'
import {
  connectDriveAccount, DriveError, getDriveConfig, getDriveConfigIssue, pickDriveFiles, preloadGoogleScripts,
  shareFilesWithAnyone, shareFilesWithUser, type DriveAccount, type ShareFailure,
} from './drive'
import type { DriveFile } from './types'

export interface GoogleDriveApi {
  /** Why Drive cannot be used (missing environment variables), or null when it is ready. */
  configIssue: string | null
  busy: boolean
  connect: (selectAccount?: boolean) => Promise<DriveAccount>
  pick: (max: number) => Promise<DriveFile[]>
  shareWithAnyone: (files: DriveFile[]) => Promise<ShareFailure[]>
  shareWithUser: (files: DriveFile[], email: string) => Promise<void>
}

export function useGoogleDrive(): GoogleDriveApi {
  const configIssue = useMemo(() => getDriveConfigIssue(), [])
  const [pending, setPending] = useState(0)

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
      pick: (max) => track(() => pickDriveFiles(config(), max)),
      shareWithAnyone: (files) => track(() => shareFilesWithAnyone(config(), files)),
      shareWithUser: (files, email) => track(() => shareFilesWithUser(config(), files, email)),
    }
  }, [configIssue, pending])
}
