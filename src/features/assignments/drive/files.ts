import { buildDriveOpenUrl } from '../../modules/links'
import type { DriveKind } from '../../modules/types'
import type { DriveFile } from '../types'
import { DriveError } from './errors'

const GOOGLE_APPS_PREFIX = 'application/vnd.google-apps.'

/** What the Google file picker hands back for one chosen item. Everything is treated as untrusted. */
export interface PickerDocument {
  id?: unknown
  name?: unknown
  mimeType?: unknown
}

export function kindFromMimeType(mimeType: string): DriveKind {
  switch (mimeType) {
    case `${GOOGLE_APPS_PREFIX}document`: return 'doc'
    case `${GOOGLE_APPS_PREFIX}spreadsheet`: return 'sheet'
    case `${GOOGLE_APPS_PREFIX}presentation`: return 'slides'
    default: return 'file'
  }
}

function cleanName(value: unknown): string {
  const text = typeof value === 'string' ? [...value].filter((char) => { const code = char.charCodeAt(0); return code >= 32 && code !== 127 }).join('').trim() : ''
  return text.slice(0, 200) || 'Untitled file'
}

/**
 * Turns a picker result into the small record we store. The link is rebuilt from the file id
 * rather than trusting a URL from the picker, and folders/forms/shortcuts are rejected.
 */
export function toDriveFile(doc: PickerDocument): DriveFile {
  const name = cleanName(doc.name)
  const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType.slice(0, 150) : ''
  const fileId = typeof doc.id === 'string' ? doc.id : ''
  if (!mimeType || !fileId) throw new DriveError('unsupported', 'Google Drive did not return enough information about that file. Pick it again.')
  const kind = kindFromMimeType(mimeType)
  if (mimeType.startsWith(GOOGLE_APPS_PREFIX) && kind === 'file') {
    throw new DriveError('unsupported', `“${name}” cannot be attached. Choose a document, spreadsheet, presentation, PDF or another file, not a folder or form.`)
  }
  let url: string
  try { url = buildDriveOpenUrl(kind, fileId) } catch { throw new DriveError('unsupported', `“${name}” has a file id this app cannot use. Pick it again.`) }
  return { fileId, name, mimeType, kind, url }
}

export function fileTypeLabel(file: Pick<DriveFile, 'kind' | 'mimeType'>): string {
  if (file.kind === 'doc') return 'Google Doc'
  if (file.kind === 'sheet') return 'Google Sheet'
  if (file.kind === 'slides') return 'Google Slides'
  const mime = file.mimeType
  if (mime === 'application/pdf') return 'PDF'
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word document'
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel spreadsheet'
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'PowerPoint'
  if (mime.startsWith('image/')) return 'Image'
  if (mime.startsWith('text/')) return 'Text file'
  return 'File'
}

export type FileIconKind = 'text' | 'sheet' | 'slides' | 'generic'

export function fileIconKind(file: Pick<DriveFile, 'kind' | 'mimeType'>): FileIconKind {
  if (file.kind === 'doc') return 'text'
  if (file.kind === 'sheet') return 'sheet'
  if (file.kind === 'slides') return 'slides'
  const label = fileTypeLabel(file)
  if (label === 'Word document' || label === 'Text file' || label === 'PDF') return 'text'
  if (label === 'Excel spreadsheet') return 'sheet'
  if (label === 'PowerPoint') return 'slides'
  return 'generic'
}

/** Adds newly chosen files without duplicates and without going over the limit. */
export function mergeFiles(existing: DriveFile[], added: DriveFile[], max: number): { files: DriveFile[]; truncated: boolean } {
  const seen = new Set(existing.map((file) => file.fileId))
  const merged = [...existing]
  let truncated = false
  for (const file of added) {
    if (seen.has(file.fileId)) continue
    if (merged.length >= max) { truncated = true; continue }
    seen.add(file.fileId)
    merged.push(file)
  }
  return { files: merged, truncated }
}
