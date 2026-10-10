import { MAX_DOCUMENT_TEXT_CHARS } from './constants'
import { DocumentError } from './errors'
import { readZipEntry } from './zip'

const MAX_PPTX_XML_BYTES = 5 * 1024 * 1024
const MAX_PPTX_SLIDES = 100

/** Extracts readable DrawingML text runs from a slide or speaker-notes XML document. */
export function pptxXmlToText(xml: string): string {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml')
  if (parsed.getElementsByTagName('parsererror').length > 0) {
    throw new DocumentError('This PowerPoint file is damaged and could not be opened.')
  }
  return Array.from(parsed.getElementsByTagName('*'))
    .filter((node) => node.localName === 't' && node.namespaceURI === 'http://schemas.openxmlformats.org/drawingml/2006/main')
    .map((node) => node.textContent ?? '')
    .filter(Boolean)
    .join(' ')
}

/** Reads slide text and speaker notes from the Open XML zip without adding a zip dependency. */
export async function extractPptxText(buffer: ArrayBuffer): Promise<string> {
  const sections: string[] = []
  let foundSlide = false
  let missedAfterSlide = 0

  for (let slide = 1; slide <= MAX_PPTX_SLIDES && missedAfterSlide < 4; slide += 1) {
    const slideXml = await readZipEntry(
      buffer,
      `ppt/slides/slide${slide}.xml`,
      MAX_PPTX_XML_BYTES,
      undefined,
      'PowerPoint (.pptx)',
    )
    if (!slideXml) {
      if (foundSlide) missedAfterSlide += 1
      continue
    }
    foundSlide = true
    missedAfterSlide = 0

    const slideText = pptxXmlToText(new TextDecoder().decode(slideXml))
    const notesXml = await readZipEntry(
      buffer,
      `ppt/notesSlides/notesSlide${slide}.xml`,
      MAX_PPTX_XML_BYTES,
      undefined,
      'PowerPoint (.pptx)',
    )
    const notesText = notesXml ? pptxXmlToText(new TextDecoder().decode(notesXml)) : ''
    if (slideText) sections.push(`Slide ${slide}\n${slideText}`)
    if (notesText) sections.push(`Speaker notes ${slide}\n${notesText}`)
    if (sections.join('\n\n').length >= MAX_DOCUMENT_TEXT_CHARS) break
  }

  if (!foundSlide) throw new DocumentError('This does not look like a PowerPoint (.pptx) file. It may be password-protected or damaged.')
  return sections.join('\n\n').slice(0, MAX_DOCUMENT_TEXT_CHARS)
}
