import { MAX_DOCX_XML_BYTES } from './constants'
import { DocumentError } from './errors'
import { readZipEntry, type Inflate } from './zip'

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** Turns the XML of a Word document body into plain text, one line per paragraph. Tracked deletions are skipped. */
export function docxXmlToText(xml: string): string {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new DocumentError('This Word file is damaged and could not be opened.')
  }

  const lines: string[] = []
  for (const paragraph of Array.from(parsed.getElementsByTagNameNS(WORD_NAMESPACE, 'p'))) {
    let line = ''
    for (const node of Array.from(paragraph.getElementsByTagName('*'))) {
      if (node.namespaceURI !== WORD_NAMESPACE) continue
      if (node.localName === 't') line += node.textContent ?? ''
      else if (node.localName === 'tab') line += '\t'
      else if (node.localName === 'br' || node.localName === 'cr') line += '\n'
    }
    lines.push(line)
  }
  return lines.join('\n')
}

export async function extractDocxText(buffer: ArrayBuffer, inflate?: Inflate): Promise<string> {
  const entry = await readZipEntry(buffer, 'word/document.xml', MAX_DOCX_XML_BYTES, inflate)
  if (!entry) throw new DocumentError('This does not look like a Word (.docx) file.')
  return docxXmlToText(new TextDecoder().decode(entry))
}
