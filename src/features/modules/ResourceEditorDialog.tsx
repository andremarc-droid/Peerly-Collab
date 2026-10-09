import { useEffect, useMemo, useRef, useState } from 'react'
import { CirclePlay, FileText, Link2 } from 'lucide-react'
import { Alert } from '../../shared/ui/Alert'
import { Button } from '../../shared/ui/Button'
import { Dialog } from '../../shared/ui/Dialog'
import { Input } from '../../shared/ui/Input'
import { Textarea } from '../../shared/ui/Textarea'
import { buildDriveEmbedUrl, buildDriveOpenUrl, buildYouTubeEmbedUrl, normalizeGenericUrl, parseDriveUrl, parseYouTubeUrl } from './links'
import { ResourceEmbed } from './ResourceEmbed'
import type { DriveKind, ModuleResource, ResourceType } from './types'
import { AddFileButtons } from '../assignments/AddFileButtons'
import type { DriveFile } from '../assignments/types'
import type { GoogleDriveApi } from '../assignments/useGoogleDrive'

export type ResourceInput = Omit<ModuleResource, 'order' | 'createdAt' | 'updatedAt'>
interface ResourceEditorDialogProps { open: boolean; initial?: ModuleResource; drive?: GoogleDriveApi; onClose: () => void; onSave: (value: ResourceInput) => Promise<void> }
const kindName: Record<DriveKind, string> = { file: 'Drive file', doc: 'Google Doc', sheet: 'Google Sheet', slides: 'Google Slides' }

export function ResourceEditorDialog({ open, initial, drive, onClose, onSave }: ResourceEditorDialogProps) {
  if (!open) return null
  return <ResourceEditorDialogForm key={`${initial?.type ?? 'new'}-${initial?.title ?? ''}-${initial?.url ?? ''}`} initial={initial} drive={drive} onClose={onClose} onSave={onSave} />
}

function ResourceEditorDialogForm({ initial, drive, onClose, onSave }: Omit<ResourceEditorDialogProps, 'open'>) {
  const [type, setType] = useState<ResourceType>(initial?.type ?? 'drive')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [submittedError, setSubmittedError] = useState('')
  const [uploaded, setUploaded] = useState<DriveFile | null>(null)
  const [driveWarning, setDriveWarning] = useState('')
  const manualTitle = useRef(false)
  const parsedDrive = useMemo(() => { if (type !== 'drive' || !url.trim()) return null; try { return { value: parseDriveUrl(url), error: '' } } catch (reason) { return { value: null, error: reason instanceof Error ? reason.message : 'Enter a valid Google Drive link.' } } }, [type, url])
  const parsedYoutube = useMemo(() => { if (type !== 'youtube' || !url.trim()) return null; try { return { id: parseYouTubeUrl(url), error: '' } } catch (reason) { return { id: '', error: reason instanceof Error ? reason.message : 'Enter a valid YouTube link.' } } }, [type, url])

  useEffect(() => {
    if (type !== 'drive' || !parsedDrive?.value || manualTitle.current) return
    const generated = `${kindName[parsedDrive.value.kind]} ${parsedDrive.value.fileId.slice(0, 8)}`
    setTitle(generated)
  }, [type, parsedDrive])

  const error = submittedError || (type === 'drive' ? parsedDrive?.error : type === 'youtube' ? parsedYoutube?.error : type === 'link' && url.trim() && !isHttpsUrl(url) ? 'Use a secure HTTPS link.' : '') || ''
  const valid = Boolean(title.trim()) && (type === 'drive' ? Boolean(parsedDrive?.value) : type === 'youtube' ? Boolean(parsedYoutube?.id) : type === 'link' ? isHttpsUrl(url) : Boolean(body.trim()))

  function onUrlChange(value: string) { setUrl(value); if (!manualTitle.current) setTitle('') }
  function onTitleChange(value: string) { manualTitle.current = true; setTitle(value) }
  async function fileAdded(files: DriveFile[]) {
    const file = files[0]
    if (!file) return
    if (drive) {
      const failures = await drive.shareWithAnyone([file])
      if (failures.length) setDriveWarning(`${failures[0].error.message} Students may need access granted in Google Drive.`)
      else setDriveWarning('')
    }
    setUploaded(file)
    setUrl(buildDriveOpenUrl(file.kind, file.fileId))
    if (!manualTitle.current) setTitle(file.name)
    setSubmittedError('')
  }
  async function save() {
    setSubmittedError('')
    if (!title.trim()) { setSubmittedError('A title is required.'); return }
    let resource: ResourceInput
    try {
      if (type === 'drive') {
        const parsed = parseDriveUrl(url)
        resource = { type, title: title.trim(), url: normalizeGenericUrl(url), driveFileId: parsed.fileId, driveKind: parsed.kind }
      } else if (type === 'youtube') {
        const youtubeVideoId = parseYouTubeUrl(url)
        resource = { type, title: title.trim(), url: normalizeGenericUrl(url), youtubeVideoId }
      } else if (type === 'link') {
        const normalized = normalizeGenericUrl(url)
        if (!normalized.startsWith('https://')) throw new Error('Use a secure HTTPS link.')
        resource = { type, title: title.trim(), url: normalized }
      } else {
        if (!body.trim()) throw new Error('Add the note text before saving.')
        resource = { type, title: title.trim(), body: body.slice(0, 5000) }
      }
      setBusy(true); await onSave(resource); onClose()
    } catch (reason) { setSubmittedError(reason instanceof Error ? reason.message : 'This resource could not be saved.') }
    finally { setBusy(false) }
  }

  const drivePreview = parsedDrive?.value ? buildDriveEmbedUrl(parsedDrive.value.kind, parsedDrive.value.fileId) : ''
  const driveOpen = parsedDrive?.value ? buildDriveOpenUrl(parsedDrive.value.kind, parsedDrive.value.fileId) : ''
  const youtubePreview = parsedYoutube?.id ? buildYouTubeEmbedUrl(parsedYoutube.id) : ''
  const youtubeOpen = parsedYoutube?.id ? new URL(url).toString() : ''

  return <Dialog open onClose={onClose} title={`${initial ? 'Edit' : 'Add'} ${type === 'drive' ? 'Google Drive file' : type === 'youtube' ? 'YouTube video' : type === 'link' ? 'link' : 'note'}`} description="Add a resource to this module." className="resource-editor-dialog">
    <div className="resource-type-switch" aria-label="Resource type">
      {([['drive', 'Google Drive file', <FileText key="drive" size={16} aria-hidden="true" />], ['youtube', 'YouTube video', <CirclePlay key="youtube" size={16} aria-hidden="true" />], ['link', 'Link', <Link2 key="link" size={16} aria-hidden="true" />], ['text', 'Note', <FileText key="text" size={16} aria-hidden="true" />]] as const).map(([value, label, icon]) => <button type="button" key={value} aria-pressed={type === value} onClick={() => { setType(value); setSubmittedError('') }}>{icon}{label}</button>)}
    </div>
    {type === 'drive' && drive && <div className="grid gap-2"><p className="m-0 text-base">Upload a file from your device or choose one already in Google Drive. The file stays in your Drive.</p>{drive.configIssue && <Alert tone="warning" label="Google Drive is not set up">{drive.configIssue}</Alert>}<AddFileButtons remaining={uploaded ? 0 : 1} drive={drive} onAdded={fileAdded} onError={setSubmittedError} /><p className="m-0 text-sm text-navy-800-72" role="status">{uploaded ? `Selected: ${uploaded.name}` : ''}</p>{driveWarning && <p className="m-0 text-sm text-navy-900" role="alert">{driveWarning}</p>}</div>}
    {(type === 'drive' && !uploaded || type === 'youtube' || type === 'link') && <Input label={type === 'drive' ? 'Google Drive link' : type === 'youtube' ? 'YouTube link' : 'Secure link'} name="resource-url" type="url" value={url} onChange={(event) => { setUploaded(null); onUrlChange(event.target.value) }} hint={type === 'link' ? 'This link opens in a new tab.' : 'Paste a share link.'} error={error || undefined} />}
    <Input label="Title" name="resource-title" value={title} maxLength={120} onChange={(event) => onTitleChange(event.target.value)} error={!title.trim() && submittedError ? 'A title is required.' : undefined} />
    {type === 'drive' && <>
      {parsedDrive?.value && <p className="resource-detected-kind">Detected: <strong>{kindName[parsedDrive.value.kind]}</strong></p>}
      <p className="resource-help">Students need viewer access to the file. Uploaded files are shared as view-only; for pasted links, set General access to “Anyone with the link” (Viewer) in Drive.</p>
      {drivePreview ? <section className="resource-preview" aria-label="Live Drive preview"><h3>Test preview</h3><ResourceEmbed src={drivePreview} fallbackUrl={driveOpen} title={`${title || 'Google Drive file'} preview`} fallbackLabel="Open in Drive" /><p>School Google accounts can limit this. If the preview below stays blank or says you need access, either your school restricts public sharing or the file is still private. Try uploading the file from a personal Google account.</p><p>A blank preview can also come from a browser that blocks third-party cookies.</p></section> : <p className="resource-preview__empty">Paste a supported Drive file link or upload a file to test the preview.</p>}
    </>}
    {type === 'youtube' && youtubePreview && <section className="resource-preview" aria-label="Live YouTube preview"><h3>Test preview</h3><ResourceEmbed src={youtubePreview} fallbackUrl={youtubeOpen} title={`${title || 'YouTube video'} preview`} fallbackLabel="Open on YouTube" /></section>}
    {type === 'text' && <Textarea label="Note text" name="resource-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} hint="Plain text only, no HTML." error={submittedError || undefined} />}
    {type === 'link' && <p className="resource-help">This link opens in a new tab and will not be embedded in the module.</p>}
    <div className="dialog__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" onClick={() => void save()} disabled={!valid || busy}>{busy ? 'Saving…' : 'Save resource'}</Button></div>
  </Dialog>
}

function isHttpsUrl(value: string) { try { return new URL(normalizeGenericUrl(value)).protocol === 'https:' } catch { return false } }
