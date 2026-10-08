import { MAX_DOCUMENT_TEXT_CHARS, MAX_PDF_PAGES } from './constants'
import { DocumentError } from './errors'

export interface PdfText {
  text: string
  totalPages: number
  pagesRead: number
}

interface TextRun {
  str?: unknown
  hasEOL?: unknown
}

/** Joins the text runs of one PDF page. pdf.js already inserts spaces between words, so runs are concatenated. */
export function joinPdfItems(items: ReadonlyArray<object>): string {
  let text = ''
  for (const item of items) {
    const run = item as TextRun
    if (typeof run.str !== 'string') continue
    text += run.str
    if (run.hasEOL === true) text += '\n'
  }
  return text
}

function describePdfError(error: unknown): DocumentError {
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return new DocumentError('This PDF is password-protected. Remove the password and try again.')
  if (name === 'InvalidPDFException') return new DocumentError('This file is not a valid PDF.')
  return new DocumentError('This PDF could not be read. It may be damaged.')
}

// Loaded on demand so the PDF reader stays out of the main bundle until someone picks a PDF.
async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** Reads the selectable text of a PDF in the browser. Scanned pages (pictures of text) have none. */
export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfText> {
  const pdfjs = await loadPdfjs()

  let pdf
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  } catch (error) {
    throw describePdfError(error)
  }

  try {
    const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES)
    let text = ''
    let pagesRead = 0
    for (let number = 1; number <= pageLimit; number += 1) {
      const page = await pdf.getPage(number)
      const content = await page.getTextContent()
      text += `${joinPdfItems(content.items)}\n\n`
      page.cleanup()
      pagesRead = number
      // Stop once there is clearly more than will be kept.
      if (text.length > MAX_DOCUMENT_TEXT_CHARS * 1.2) break
    }
    return { text, totalPages: pdf.numPages, pagesRead }
  } catch (error) {
    throw describePdfError(error)
  } finally {
    await pdf.destroy()
  }
}
