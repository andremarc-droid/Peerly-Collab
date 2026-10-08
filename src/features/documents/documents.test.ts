import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENT_TEXT_CHARS } from './constants'
import { docxXmlToText, extractDocxText } from './docx'
import { DocumentError } from './errors'
import { detectKind, extractDocument, prepareDocuments, type DocumentFile, type ExtractDeps } from './extractDocument'
import { joinPdfItems } from './pdf'
import { cleanExtractedText, cleanFileName, condenseText } from './text'
import { readZipEntry } from './zip'

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

/** Builds a one-entry zip archive by hand so the reader can be tested without a fixture file. */
function zipWithEntry(name: string, content: string, method = 0): ArrayBuffer {
  const encoder = new TextEncoder()
  const nameBytes = encoder.encode(name)
  const data = encoder.encode(content)

  const local = new Uint8Array(30 + nameBytes.length + data.length)
  const localView = new DataView(local.buffer)
  localView.setUint32(0, 0x04034b50, true)
  localView.setUint16(8, method, true)
  localView.setUint32(18, data.length, true)
  localView.setUint32(22, data.length, true)
  localView.setUint16(26, nameBytes.length, true)
  local.set(nameBytes, 30)
  local.set(data, 30 + nameBytes.length)

  const central = new Uint8Array(46 + nameBytes.length)
  const centralView = new DataView(central.buffer)
  centralView.setUint32(0, 0x02014b50, true)
  centralView.setUint16(10, method, true)
  centralView.setUint32(20, data.length, true)
  centralView.setUint32(24, data.length, true)
  centralView.setUint16(28, nameBytes.length, true)
  centralView.setUint32(42, 0, true)
  central.set(nameBytes, 46)

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, 1, true)
  endView.setUint16(10, 1, true)
  endView.setUint32(12, central.length, true)
  endView.setUint32(16, local.length, true)

  const all = new Uint8Array(local.length + central.length + end.length)
  all.set(local, 0)
  all.set(central, local.length)
  all.set(end, local.length + central.length)
  return all.buffer
}

function fakeFile(name: string, content: string, options: { type?: string; size?: number } = {}): DocumentFile {
  return {
    name,
    type: options.type ?? '',
    size: options.size ?? content.length,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  } as DocumentFile
}

function fakeDeps(overrides: Partial<ExtractDeps> = {}): ExtractDeps {
  let counter = 0
  return {
    pdf: async () => ({ text: 'pdf text', totalPages: 1, pagesRead: 1 }),
    docx: async () => 'docx text',
    makeId: () => `id${(counter += 1)}`,
    ...overrides,
  }
}

describe('cleanExtractedText', () => {
  it('normalizes newlines, control characters and spacing', () => {
    expect(cleanExtractedText('\uFEFFHello \u0000  world\r\n\r\n\r\n\r\nNext\u00a0line  ')).toBe('Hello world\n\nNext line')
  })
})

describe('cleanFileName', () => {
  it('strips control characters, trims and falls back', () => {
    expect(cleanFileName('  my\u0000 notes.pdf ')).toBe('my notes.pdf')
    expect(cleanFileName('   ')).toBe('document')
    expect(cleanFileName('x'.repeat(200))).toHaveLength(80)
  })
})

describe('condenseText', () => {
  it('returns short text unchanged', () => {
    expect(condenseText('short text', 100)).toEqual({ text: 'short text', condensed: false })
  })

  it('stays within the budget and samples across the whole document', () => {
    const text = Array.from({ length: 600 }, (_, index) => `Sentence number ${index} says something useful.`).join(' ')
    const result = condenseText(text, 3000)
    expect(result.condensed).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(3000)
    expect(result.text).toContain('Sentence number 0 ')
    expect(result.text).toContain('[…]')
    // Something from the last third of the document must survive, not just the first pages.
    expect(result.text).toMatch(/Sentence number (4\d\d|5\d\d) /)
  })

  it('handles tiny and zero budgets', () => {
    expect(condenseText('abc', 0)).toEqual({ text: '', condensed: true })
    expect(condenseText('x'.repeat(500), 100).text.length).toBeLessThanOrEqual(100)
  })
})

describe('docxXmlToText', () => {
  it('reads paragraphs, tabs and breaks and skips tracked deletions', () => {
    const xml =
      `<w:document xmlns:w="${WORD_NS}"><w:body>` +
      '<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t>world</w:t></w:r></w:p>' +
      '<w:p><w:r><w:delText>gone</w:delText></w:r></w:p>' +
      '<w:p><w:r><w:t>Second</w:t><w:br/><w:t>line</w:t></w:r></w:p>' +
      '</w:body></w:document>'
    expect(docxXmlToText(xml)).toBe('Hello\tworld\n\nSecond\nline')
  })

  it('rejects XML that is not well formed', () => {
    expect(() => docxXmlToText('<w:document><w:p>')).toThrow(DocumentError)
  })
})

describe('readZipEntry and extractDocxText', () => {
  const xml = `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>From Word</w:t></w:r></w:p></w:body></w:document>`

  it('finds a stored entry and reports a missing one as null', async () => {
    const zip = zipWithEntry('word/document.xml', xml)
    expect(new TextDecoder().decode((await readZipEntry(zip, 'word/document.xml', 1_000_000))!)).toBe(xml)
    expect(await readZipEntry(zip, 'word/other.xml', 1_000_000)).toBeNull()
  })

  it('reads text from a docx, using the injected inflater for compressed entries', async () => {
    const zip = zipWithEntry('word/document.xml', 'compressed-bytes', 8)
    const inflate = async () => new TextEncoder().encode(xml)
    expect(await extractDocxText(zip, inflate)).toBe('From Word')
  })

  it('refuses archives that declare too much data, and non-zip files', async () => {
    await expect(readZipEntry(zipWithEntry('word/document.xml', xml), 'word/document.xml', 5)).rejects.toThrow(/too large/)
    await expect(extractDocxText(new TextEncoder().encode('not a zip at all, just text').buffer)).rejects.toThrow(/Word/)
    await expect(extractDocxText(zipWithEntry('other.xml', xml))).rejects.toThrow(/Word/)
  })
})

describe('joinPdfItems', () => {
  it('concatenates runs, adds newlines at line ends and ignores marked-content items', () => {
    const items = [{ str: 'Hello ' }, { str: 'world', hasEOL: true }, { type: 'beginMarkedContent' }, { str: 'Next' }]
    expect(joinPdfItems(items)).toBe('Hello world\nNext')
  })
})

describe('detectKind', () => {
  it('uses the extension first and the type when there is no extension', () => {
    expect(detectKind({ name: 'a.PDF', type: '' })).toBe('pdf')
    expect(detectKind({ name: 'a.docx', type: '' })).toBe('docx')
    expect(detectKind({ name: 'a.md', type: '' })).toBe('text')
    expect(detectKind({ name: 'notes', type: 'text/plain' })).toBe('text')
    expect(detectKind({ name: 'a.exe', type: 'application/pdf' })).toBeNull()
    expect(detectKind({ name: 'a.doc', type: '' })).toBeNull()
  })
})

describe('extractDocument', () => {
  it('reads text, pdf and docx files', async () => {
    const deps = fakeDeps()
    expect(await extractDocument(fakeFile('a.txt', 'Plain  notes'), deps)).toMatchObject({ name: 'a.txt', kind: 'text', text: 'Plain notes', truncated: false })
    expect(await extractDocument(fakeFile('a.pdf', 'x'), deps)).toMatchObject({ kind: 'pdf', text: 'pdf text' })
    expect(await extractDocument(fakeFile('a.docx', 'x'), deps)).toMatchObject({ kind: 'docx', text: 'docx text' })
  })

  it('marks a PDF as shortened when not every page was read', async () => {
    const deps = fakeDeps({ pdf: async () => ({ text: 'page one', totalPages: 300, pagesRead: 100 }) })
    expect((await extractDocument(fakeFile('big.pdf', 'x'), deps)).truncated).toBe(true)
  })

  it('caps very long text and marks it shortened', async () => {
    const result = await extractDocument(fakeFile('long.txt', 'word '.repeat(20_000)), fakeDeps())
    expect(result.text.length).toBeLessThanOrEqual(MAX_DOCUMENT_TEXT_CHARS)
    expect(result.truncated).toBe(true)
  })

  it('explains why a file cannot be used', async () => {
    const deps = fakeDeps({ pdf: async () => ({ text: '  \n ', totalPages: 2, pagesRead: 2 }) })
    await expect(extractDocument(fakeFile('scan.pdf', 'x'), deps)).rejects.toThrow(/scanned/)
    await expect(extractDocument(fakeFile('old.doc', 'x'), deps)).rejects.toThrow(/\.docx or PDF/)
    await expect(extractDocument(fakeFile('a.zip', 'x'), deps)).rejects.toThrow(/not supported/)
    await expect(extractDocument(fakeFile('empty.txt', '', { size: 0 }), deps)).rejects.toThrow(/empty/)
    await expect(extractDocument(fakeFile('huge.txt', 'x', { size: MAX_DOCUMENT_FILE_BYTES + 1 }), deps)).rejects.toThrow(/10 MB/)
    await expect(extractDocument(fakeFile('binary.txt', '\uFFFD'.repeat(50) + 'abc'), deps)).rejects.toThrow(/plain text/)
  })

  it('turns unexpected failures into a safe message', async () => {
    const deps = fakeDeps({ docx: async () => { throw new Error('internal stack detail') } })
    await expect(extractDocument(fakeFile('a.docx', 'x'), deps)).rejects.toThrow('This file could not be read.')
  })
})

describe('prepareDocuments', () => {
  it('keeps good files, reports bad ones by name and respects the limit', async () => {
    const deps = fakeDeps()
    const files = [fakeFile('one.txt', 'First file'), fakeFile('bad.zip', 'x'), fakeFile('two.txt', 'Second file'), fakeFile('three.txt', 'Third file')]
    const result = await prepareDocuments(files, 0, 2, deps)
    expect(result.documents.map((document) => document.name)).toEqual(['one.txt', 'two.txt'])
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toMatch(/^bad\.zip: /)
    expect(result.errors[1]).toMatch(/up to 2 documents/)
  })

  it('adds nothing when the screen is already full', async () => {
    const result = await prepareDocuments([fakeFile('a.txt', 'Some text')], 1, 1, fakeDeps())
    expect(result.documents).toEqual([])
    expect(result.errors[0]).toMatch(/up to 1 document /)
  })
})
