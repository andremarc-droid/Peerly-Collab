import { HardDriveUpload, Paperclip } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { describeDriveError } from './drive'
import type { DriveFile } from './types'
import type { GoogleDriveApi } from './useGoogleDrive'

interface AddFileButtonsProps {
  /** How many more files can still be added. */
  remaining: number
  drive: GoogleDriveApi
  disabled?: boolean
  /** Receives files that are now saved in the person's Google Drive, whether picked or uploaded. */
  onAdded: (files: DriveFile[]) => void | Promise<void>
  /** Called with a message to show, or '' to clear the previous one. */
  onError: (message: string) => void
}

/**
 * The two ways to add a file, same as Google Classroom: upload from this computer, or choose from Google Drive.
 * Both open Google's own picker from a single click. Signing in (if needed) happens first, inside that same click,
 * and the picker then opens on its "upload from your computer" tab. Files from the computer are saved into the
 * person's own Drive, so there is no storage limit on this app.
 */
export function AddFileButtons({ remaining, drive, disabled = false, onAdded, onError }: AddFileButtonsProps) {
  const off = disabled || drive.busy || remaining < 1 || Boolean(drive.configIssue)

  async function open(mode: 'browse' | 'upload', fallback: string) {
    onError('')
    try {
      const picked = await drive.pick(remaining, mode)
      if (picked.length > 0) await onAdded(picked)
    } catch (reason) {
      const { message, silent } = describeDriveError(reason, fallback)
      if (!silent) onError(message)
    }
  }

  return <div className="assignment-actions">
    <Button type="button" disabled={off} onClick={() => void open('upload', 'The files could not be uploaded.')}><HardDriveUpload size={16} aria-hidden="true" /> {drive.busy ? 'Working…' : 'Upload from device'}</Button>
    <Button type="button" variant="secondary" disabled={off} onClick={() => void open('browse', 'The files could not be added.')}><Paperclip size={16} aria-hidden="true" /> Add from Google Drive</Button>
    <span className="text-sm text-navy-800-72" role="status">Uploads are saved in your own Google Drive</span>
  </div>
}
