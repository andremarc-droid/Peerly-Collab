import { ExternalLink, Eye, EyeOff, File, FileSpreadsheet, FileText, Presentation, X } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { buildDriveEmbedUrl } from '../modules/links'
import { fileIconKind, fileTypeLabel } from './drive'
import { isDriveUrl } from './schemas'
import type { DriveFile } from './types'
import './assignments.css'

const icons = { text: FileText, sheet: FileSpreadsheet, slides: Presentation, generic: File }

interface FileListProps {
  files: DriveFile[]
  label: string
  /** When given, each file gets a Remove button. */
  onRemove?: (file: DriveFile) => void
  disabled?: boolean
  /** When true, each file gets a Preview button that shows it inline, without leaving the page. */
  preview?: boolean
}

/** The embeddable viewer address for a file, or null when it cannot be built safely. */
function previewUrl(file: DriveFile): string | null {
  try {
    const url = buildDriveEmbedUrl(file.kind, file.fileId)
    return isDriveUrl(url) ? url : null
  } catch {
    return null
  }
}

/**
 * Stored links are only turned into hrefs after `isDriveUrl` confirms they point at Google's Drive or Docs hosts,
 * so a tampered record can never send someone to another site. Previews are rebuilt from the file id the same way.
 */
export function FileList({ files, label, onRemove, disabled = false, preview = false }: FileListProps) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  if (files.length === 0) return <p className="m-0 text-base text-navy-800-72">No files attached.</p>
  return <ul className="file-list" aria-label={label}>
    {files.map((file) => {
      const Icon = icons[fileIconKind(file)]
      const embed = preview ? previewUrl(file) : null
      const open = embed !== null && previewing === file.fileId
      return <Fragment key={file.fileId}>
        <li className="file-list__item">
          <span className="file-list__icon" aria-hidden="true"><Icon size={19} /></span>
          <span className="file-list__copy"><strong>{file.name}</strong><small>{fileTypeLabel(file)}</small></span>
          {embed && <Button type="button" variant="secondary" aria-expanded={open} aria-label={`${open ? 'Hide preview of' : 'Preview'} ${file.name}`} onClick={() => setPreviewing(open ? null : file.fileId)}>{open ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />} {open ? 'Hide' : 'Preview'}</Button>}
          {isDriveUrl(file.url)
            ? <a className="button button--secondary" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in a new tab`}><ExternalLink size={16} aria-hidden="true" /> Open</a>
            : <span className="file-list__blocked">Link blocked</span>}
          {onRemove && <Button type="button" variant="ghost" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onRemove(file)}><X size={18} aria-hidden="true" /></Button>}
        </li>
        {open && embed && <li className="list-none">
          <iframe
            src={embed}
            title={`Preview of ${file.name}`}
            className="h-[28rem] w-full rounded-xl border border-navy-900-15 bg-white"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
          <p className="mt-1 mb-0 text-sm text-navy-800-72">Not loading? Sign in to the Google account that owns this file, or use Open.</p>
        </li>}
      </Fragment>
    })}
  </ul>
}
