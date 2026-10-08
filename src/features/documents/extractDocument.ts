import { extractDocxText } from './docx'
import { MAX_BINARY_RATIO, MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENT_TEXT_CHARS, SUPPORTED_FORMATS_LABEL } from './constants'
import { DocumentError } from './errors'
import { extractPdfText, type PdfText } from './pdf'
import { cleanExtractedText, cleanFileName } from './text'

export type DocumentKind = 'pdf' | 'docx' | 'text'

export interface ExtractedDocument {
  id: string
  name: string
  kind: DocumentKind
  /** Plain text only. Always render it as text, never as HTML. */
  text: string
  /** True when only part of the file was kept (page limit or length limit). */
  truncated: boolean
}

export type DocumentFile = Pick<File, 'name' | 'type' | 'size' | 'text' | 'arrayBuffer'>

export interface ExtractDeps {
  pdf: (buffer: ArrayBuffer) => Promise<PdfText>
  docx: (buffer: ArrayBuffer) => Promise<string>
  makeId: () => string
}

const defaultDeps: ExtractDeps = {
  pdf: extractPdfText,
  docx: (buffer) => extractDocxText(buffer),
  makeId: () => crypto.randomUUID(),
}

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv'])

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function detectKind(file: Pick<File, 'name' | 'type'>): DocumentKind | null {
  const extension = extensionOf(file.name)
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (extension === '') {
    if (file.type === 'application/pdf') return 'pdf'
    if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'text/csv') return 'text'
  }
  return null
}

function unsupportedMessage(name: string): string {
  return extensionOf(name) === 'doc'
    ? 'Older Word (.doc) files cannot be read. Save it as .docx or PDF and try again.'
    : `This file type is not supported. Use ${SUPPORTED_FORMATS_LABEL}.`
}

function looksBinary(text: string): boolean {
  if (text.length === 0) return false
  let broken = 0
  for (const character of text) if (character === '\uFFFD') broken += 1
  return broken / text.length > MAX_BINARY_RATIO
}

interface RawText {
  text: string
  partial: boolean
}

async function readRaw(file: DocumentFile, kind: DocumentKind, deps: ExtractDeps): Promise<RawText> {
  if (kind === 'text') {
    const text = await file.text()
    if (looksBinary(text)) throw new DocumentError('This file does not look like plain text.')
    return { text, partial: false }
  }
  const buffer = await file.arrayBuffer()
  if (kind === 'docx') return { text: await deps.docx(buffer), partial: false }
  const pdf = await deps.pdf(buffer)
  return { text: pdf.text, partial: pdf.pagesRead < pdf.totalPages }
}

/**
 * Reads the text out of a picked file, entirely in the browser. The file itself is never kept or uploaded;
 * only its cleaned text is returned. Throws a DocumentError with a message that is safe to show.
 */
export async function extractDocument(file: DocumentFile, deps: ExtractDeps = defaultDeps): Promise<ExtractedDocument> {
  const kind = detectKind(file)
  if (!kind) throw new DocumentError(unsupportedMessage(file.name))
  if (file.size === 0) throw new DocumentError('This file is empty.')
  if (file.size > MAX_DOCUMENT_FILE_BYTES) {
    throw new DocumentError(`This file is larger than ${MAX_DOCUMENT_FILE_BYTES / (1024 * 1024)} MB.`)
  }

  let raw: RawText
  try {
    raw = await readRaw(file, kind, deps)
  } catch (error) {
    if (error instanceof DocumentError) throw error
    throw new DocumentError('This file could not be read.')
  }

  const cleaned = cleanExtractedText(raw.text)
  if (!cleaned) {
    throw new DocumentError(
      kind === 'pdf'
        ? 'No selectable text was found. This PDF may be scanned pictures of pages, which cannot be read here.'
        : 'This file has no readable text.',
    )
  }

  const overLimit = cleaned.length > MAX_DOCUMENT_TEXT_CHARS
  return {
    id: deps.makeId(),
    name: cleanFileName(file.name),
    kind,
    text: overLimit ? cleaned.slice(0, MAX_DOCUMENT_TEXT_CHARS).trimEnd() : cleaned,
    truncated: raw.partial || overLimit,
  }
}

export interface PrepareDocumentsResult {
  documents: ExtractedDocument[]
  errors: string[]
}

/** Reads several picked files in order, stopping at `max` documents in total. Failures are reported per file. */
export async function prepareDocuments(
  files: DocumentFile[],
  currentCount: number,
  max: number,
  deps?: ExtractDeps,
): Promise<PrepareDocumentsResult> {
  const documents: ExtractedDocument[] = []
  const errors: string[] = []
  const capacity = Math.max(0, max - currentCount)

  for (const file of files) {
    if (documents.length >= capacity) {
      errors.push(`You can add up to ${max} ${max === 1 ? 'document' : 'documents'} here.`)
      break
    }
    try {
      documents.push(await extractDocument(file, deps))
    } catch (error) {
      const reason = error instanceof DocumentError ? error.message : 'This file could not be read.'
      errors.push(`${cleanFileName(file.name)}: ${reason}`)
    }
  }
  return { documents, errors }
}
