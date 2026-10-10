import { describe, expect, it } from 'vitest'
import { extractPptxText, pptxXmlToText } from './pptx'

const encoder = new TextEncoder()
function storedZip(entries: Array<{ name: string; text: string }>): ArrayBuffer {
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const data = encoder.encode(entry.text)
    const localHeader = new Uint8Array(30 + name.length)
    const lv = new DataView(localHeader.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, name.length, true)
    localHeader.set(name, 30)
    local.push(localHeader, data)
    const centralHeader = new Uint8Array(46 + name.length)
    const cv = new DataView(centralHeader.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(28, name.length, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint32(42, offset, true)
    centralHeader.set(name, 46); central.push(centralHeader)
    offset += localHeader.length + data.length
  }
  const centralBytes = concat(central)
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true); view.setUint32(12, centralBytes.length, true); view.setUint32(16, offset, true)
  const bytes = concat([...local, centralBytes, end])
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
function concat(items: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(items.reduce((sum, item) => sum + item.length, 0))
  let offset = 0
  for (const item of items) { out.set(item, offset); offset += item.length }
  return out
}

describe('PPTX text extraction', () => {
  it('extracts DrawingML text and ignores unrelated XML text', () => {
    expect(pptxXmlToText('<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Title</a:t><x:t xmlns:x="elsewhere">ignored</x:t></p:sld>')).toBe('Title')
  })

  it('reads slide text and speaker notes from a small zip fixture', async () => {
    const slide = '<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Cell cycle</a:t></p:sld>'
    const notes = '<p:notes xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Explain phases</a:t></p:notes>'
    const text = await extractPptxText(storedZip([{ name: 'ppt/slides/slide1.xml', text: slide }, { name: 'ppt/notesSlides/notesSlide1.xml', text: notes }]))
    expect(text).toContain('Slide 1\nCell cycle')
    expect(text).toContain('Speaker notes 1\nExplain phases')
  })
})
