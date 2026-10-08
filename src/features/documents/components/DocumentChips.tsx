import { FileText, X } from 'lucide-react'
import type { ExtractedDocument } from '../extractDocument'

interface DocumentChipsProps {
  documents: Array<Pick<ExtractedDocument, 'id' | 'name' | 'text' | 'truncated'>>
  /** Omit for a read-only list (for example inside a sent message). */
  onRemove?: (id: string) => void
  disabled?: boolean
  label?: string
  /** Use on a navy background, such as the learner's own chat bubble. */
  onNavy?: boolean
}

function describe(document: Pick<ExtractedDocument, 'text' | 'truncated'>): string {
  const size = `${document.text.length.toLocaleString()} characters`
  return document.truncated ? `${size}, shortened` : size
}

export function DocumentChips({ documents, onRemove, disabled = false, label = 'Documents', onNavy = false }: DocumentChipsProps) {
  if (documents.length === 0) return null
  const tone = onNavy ? 'border-white/40 bg-white text-navy-900' : 'border-navy-900-12 bg-white text-navy-900'

  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={label}>
      {documents.map((document) => (
        <li key={document.id} className={`flex min-w-0 max-w-full items-center gap-2 rounded-2xl border py-1 pl-3 ${tone} ${onRemove ? 'pr-1' : 'pr-3'}`}>
          <FileText size={18} className="shrink-0" aria-hidden="true" />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-semibold">{document.name}</span>
            <span className="text-sm text-navy-800">{describe(document)}</span>
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(document.id)}
              disabled={disabled}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-navy-900 hover:bg-navy-700-07 disabled:opacity-50"
              aria-label={`Remove document ${document.name}`}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
