import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionCard } from '../../shared/ui/SectionCard'
import { useToast } from '../../shared/ui/useToast'
import { AddFileButtons } from './AddFileButtons'
import { describeDriveError, mergeFiles } from './drive'
import { FileList } from './FileList'
import { MAX_ATTACHMENTS, type DriveFile } from './types'
import type { GoogleDriveApi } from './useGoogleDrive'

interface AttachmentsSectionProps {
  files: DriveFile[]
  drive: GoogleDriveApi
  disabled?: boolean
  onChange: (files: DriveFile[]) => Promise<void>
}

/**
 * Instructors add files from their computer or from Google Drive. Either way the file ends up in their own Drive,
 * is set to "anyone with the link can view", and then shows up for every student in the class.
 */
export function AttachmentsSection({ files, drive, disabled = false, onChange }: AttachmentsSectionProps) {
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = drive.busy || saving

  async function added(incoming: DriveFile[]) {
    setWarning('')
    const { files: next, truncated } = mergeFiles(files, incoming, MAX_ATTACHMENTS)
    const fresh = next.filter((file) => !files.some((existing) => existing.fileId === file.fileId))
    if (fresh.length === 0) { showToast('info', truncated ? `You can attach up to ${MAX_ATTACHMENTS} files.` : 'Those files are already attached.'); return }
    setSaving(true)
    try {
      const failures = await drive.shareWithAnyone(fresh)
      await onChange(next)
      if (failures.length > 0) setWarning(`${failures.map((failure) => `“${failure.file.name}”`).join(', ')} could not be shared with students. ${failures[0].error.message}`)
      else showToast('success', `${fresh.length} ${fresh.length === 1 ? 'file' : 'files'} added. Students can see ${fresh.length === 1 ? 'it' : 'them'} now if the assignment is published.`)
      if (truncated) showToast('info', `Only the first ${MAX_ATTACHMENTS} files were kept.`)
    } catch (reason) {
      const { message, silent } = describeDriveError(reason, 'The files could not be attached.')
      if (!silent) setError(message)
    } finally { setSaving(false) }
  }

  async function remove(file: DriveFile) {
    setError('')
    setSaving(true)
    try { await onChange(files.filter((item) => item.fileId !== file.fileId)); showToast('info', `“${file.name}” was removed from this assignment. It stays in your Drive.`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The file could not be removed.') }
    finally { setSaving(false) }
  }

  return <SectionCard title="Materials" description={`${files.length} of ${MAX_ATTACHMENTS} files · Visible to students once published`} icon={<Paperclip size={20} />}>
    {drive.configIssue && <Alert tone="warning" label="Google Drive is not set up">{drive.configIssue}</Alert>}
    <AddFileButtons remaining={MAX_ATTACHMENTS - files.length} drive={drive} disabled={disabled || busy} onAdded={added} onError={setError} />
    {error && <Alert tone="error" label="Could not add files">{error}</Alert>}
    {warning && <Alert tone="warning" label="Some files are not shared">{warning} Open the file in Drive, choose Share, and allow “Anyone with the link” to view.</Alert>}
    {files.length > 0
      ? <FileList files={files} label="Assignment materials" onRemove={(file) => void remove(file)} disabled={disabled || busy} />
      : <EmptyState title="No materials yet" description="Upload Word, PDF, Excel or slide files from your computer, or choose them from Google Drive. Students open them right inside the assignment." />}
    <p className="m-0 text-sm text-navy-800-72">Anyone with the link can view these files, so don’t attach anything private.</p>
  </SectionCard>
}
