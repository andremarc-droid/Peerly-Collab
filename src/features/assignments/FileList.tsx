import { ExternalLink, File, FileSpreadsheet, FileText, Presentation, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
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
}

/**
 * Stored links are only turned into hrefs after `isDriveUrl` confirms they point at Google's Drive or Docs hosts,
 * so a tampered record can never send someone to another site.
 */
export function FileList({ files, label, onRemove, disabled = false }: FileListProps) {
  return <ul className="file-list" aria-label={label}>
    {files.map((file) => {
      const Icon = icons[fileIconKind(file)]
      return <li key={file.fileId} className="file-list__item">
        <span className="file-list__icon" aria-hidden="true"><Icon size={19} /></span>
        <span className="file-list__copy"><strong>{file.name}</strong><small>{fileTypeLabel(file)}</small></span>
        {isDriveUrl(file.url)
          ? <a className="button button--secondary" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.name} in a new tab`}><ExternalLink size={16} aria-hidden="true" /> Open</a>
          : <span className="file-list__blocked">Link blocked</span>}
        {onRemove && <Button type="button" variant="ghost" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => onRemove(file)}><X size={18} aria-hidden="true" /></Button>}
      </li>
    })}
  </ul>
}
