/** Largest file the browser will open. The text is extracted locally; the file itself is never stored or uploaded. */
export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024

/**
 * Most text kept from one document. Firestore is not involved: the text lives in memory (flashcards) or in the
 * chat message on this device. What actually reaches the AI is smaller still (see `condenseText`), because of Groq's
 * per-minute token limit.
 */
export const MAX_DOCUMENT_TEXT_CHARS = 30_000

export const MAX_PDF_PAGES = 100
/** Guards against a Word file that inflates to something enormous (a "zip bomb"). */
export const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024
export const MAX_DOCUMENT_NAME_CHARS = 80

/** Share of replacement characters above which a "text" file is treated as binary. */
export const MAX_BINARY_RATIO = 0.02

export const DOCUMENT_ACCEPT = [
  '.pdf',
  '.docx',
  '.pptx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
].join(',')

export const SUPPORTED_FORMATS_LABEL = 'PDF, Word (.docx), PowerPoint (.pptx), or text (.txt, .md, .csv)'
