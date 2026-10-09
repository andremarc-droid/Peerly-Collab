import { HardDriveUpload, Paperclip, RotateCw } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '../../shared/ui/Button'
import { describeDriveError, MAX_UPLOAD_MB } from './drive'
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
 * Files from the computer are saved into the person's own Drive first, so there is no storage limit on this app.
 */
export function AddFileButtons({ remaining, drive, disabled = false, onAdded, onError }: AddFileButtonsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [waiting, setWaiting] = useState<File[]>([])
  const [needsClick, setNeedsClick] = useState(false)
  const off = disabled || drive.busy || remaining < 1 || Boolean(drive.configIssue)

  async function upload(files: File[]) {
    onError('')
    try {
      const { uploaded, failures } = await drive.upload(files)
      const failedNames = new Set(failures.map((failure) => failure.name))
      setWaiting(files.filter((file) => failedNames.has(file.name)))
      if (failures.length > 0) onError(`${failures.map((failure) => `“${failure.name}”: ${failure.message}`).join(' ')} ${uploaded.length > 0 ? 'The other files were added.' : ''}`.trim())
      if (uploaded.length > 0) await onAdded(uploaded)
    } catch (reason) {
      // Kept so one click can try again. A blocked Google sign-in window needs a fresh click, not a new file choice.
      setWaiting(files)
      const { message, silent } = describeDriveError(reason, 'The files could not be uploaded.')
      if (!silent) onError(message)
    }
  }

  function chosen(event: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (list.length === 0) return
    const files = list.slice(0, remaining)
    if (list.length > files.length) onError(`You can add ${remaining} more ${remaining === 1 ? 'file' : 'files'}. The rest were skipped.`)
    void upload(files)
  }

  /**
   * Browsers only allow a pop-up or file window right after a click, and opening Google's sign-in pop-up uses that
   * click up. So when a sign-in is needed, do it first and ask for one more click to choose files.
   * Once signed in, the file window opens straight away.
   */
  async function chooseFromDevice() {
    onError('')
    setNeedsClick(false)
    if (!drive.hasSession()) {
      try { await drive.connect() } catch (reason) {
        const { message, silent } = describeDriveError(reason, 'Could not connect to Google Drive.')
        if (!silent) onError(message)
        return
      }
      setNeedsClick(true)
      return
    }
    inputRef.current?.click()
  }

  async function pick() {
    onError('')
    try {
      const picked = await drive.pick(remaining)
      if (picked.length > 0) await onAdded(picked)
    } catch (reason) {
      const { message, silent } = describeDriveError(reason, 'The files could not be added.')
      if (!silent) onError(message)
    }
  }

  return <div className="assignment-actions">
    <input ref={inputRef} type="file" multiple={remaining > 1} hidden onChange={chosen} aria-hidden="true" tabIndex={-1} />
    <Button type="button" disabled={off} onClick={() => void chooseFromDevice()}><HardDriveUpload size={16} aria-hidden="true" /> {drive.busy ? 'Working…' : 'Upload from device'}</Button>
    <Button type="button" variant="secondary" disabled={off} onClick={() => void pick()}><Paperclip size={16} aria-hidden="true" /> Add from Google Drive</Button>
    {waiting.length > 0 && !drive.busy && <Button type="button" variant="secondary" onClick={() => void upload(waiting)}><RotateCw size={16} aria-hidden="true" /> Try again ({waiting.length} {waiting.length === 1 ? 'file' : 'files'})</Button>}
    <span className="text-sm text-navy-800-72" role="status">{needsClick ? 'Google Drive is connected. Click “Upload from device” again to choose your files.' : `Uploads are saved in your own Google Drive · up to ${MAX_UPLOAD_MB} MB each`}</span>
  </div>
}
