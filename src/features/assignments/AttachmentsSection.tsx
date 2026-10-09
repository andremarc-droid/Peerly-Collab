import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SectionCard } from '../../shared/ui/SectionCard'
import { useToast } from '../../shared/ui/useToast'
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

/** Instructors choose files from their own Drive. Each one is set to "anyone with the link can view" so students can open it. */
export function AttachmentsSection({ files, drive, disabled = false, onChange }: AttachmentsSectionProps) {
  const { showToast } = useToast()
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const full = files.length >= MAX_ATTACHMENTS
  const busy = drive.busy || saving

  async function add() {
    setError(''); setWarning('')
    try {
      const picked = await drive.pick(MAX_ATTACHMENTS - files.length)
      if (picked.length === 0) return
      const { files: next, truncated } = mergeFiles(files, picked, MAX_ATTACHMENTS)
      const added = next.filter((file) => !files.some((existing) => existing.fileId === file.fileId))
      if (added.length === 0) { showToast('info', truncated ? `You can attach up to ${MAX_ATTACHMENTS} files.` : 'Those files are already attached.'); return }
      const failures = await drive.shareWithAnyone(added)
      setSaving(true)
      await onChange(next)
      if (failures.length > 0) {
        setWarning(`${failures.map((failure) => `“${failure.file.name}”`).join(', ')} could not be shared with students. ${failures[0].error.message}`)
      } else {
        showToast('success', `${added.length} ${added.length === 1 ? 'file' : 'files'} attached and shared with the link.`)
      }
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

  return <SectionCard title="Files" description={`${files.length} of ${MAX_ATTACHMENTS} files · Stored in your Google Drive`} icon={<Paperclip size={20} />}
    action={<Button type="button" disabled={disabled || busy || full || Boolean(drive.configIssue)} onClick={() => void add()}>{busy ? 'Working…' : 'Add from Google Drive'}</Button>}>
    {drive.configIssue && <Alert tone="warning" label="Google Drive is not set up">{drive.configIssue}</Alert>}
    {error && <Alert tone="error" label="Could not add files">{error}</Alert>}
    {warning && <Alert tone="warning" label="Some files are not shared">{warning} Open the file in Drive, choose Share, and allow “Anyone with the link” to view.</Alert>}
    {files.length > 0
      ? <FileList files={files} label="Attached files" onRemove={(file) => void remove(file)} disabled={disabled || busy} />
      : <EmptyState title="No files yet" description="Attach Word, PDF, Excel or slide files from your Google Drive. Students open them from your Drive, so there is no upload size limit." />}
    {full && <p className="m-0 text-sm text-navy-800-72">This assignment already has {MAX_ATTACHMENTS} files.</p>}
  </SectionCard>
}
