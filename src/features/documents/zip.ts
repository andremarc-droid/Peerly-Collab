import { DocumentError } from './errors'

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50
const LOCAL_ENTRY = 0x04034b50
const STORED = 0
const DEFLATED = 8

export type Inflate = (data: Uint8Array, maxBytes: number) => Promise<Uint8Array>

const TOO_LARGE = 'This document is too large to read.'
const DAMAGED = 'This zipped document is damaged and could not be opened.'

/** Inflates raw DEFLATE data with the browser's built-in decompressor, stopping if the result gets too big. */
export const inflateRaw: Inflate = async (data, maxBytes) => {
  if (typeof DecompressionStream === 'undefined') {
    throw new DocumentError('This browser cannot open compressed Office files. Save the file as a PDF or text file instead.')
  }
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new DocumentError(TOO_LARGE)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof DocumentError) throw error
    throw new DocumentError(DAMAGED)
  }

  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function findEndOfCentralDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - 22 - 0xffff)
  for (let index = view.byteLength - 22; index >= lowest; index -= 1) {
    if (view.getUint32(index, true) === END_OF_CENTRAL_DIRECTORY) return index
  }
  return -1
}

/**
 * Reads one file out of a zip archive (a .docx is a zip). Returns null when the archive has no such entry.
 * Only what is needed is parsed: the central directory, then the one entry's data. Zip64 is not supported.
 * `maxBytes` caps the unzipped size, both as declared and as actually produced.
 */
export async function readZipEntry(
  buffer: ArrayBuffer,
  entryName: string,
  maxBytes: number,
  inflate: Inflate = inflateRaw,
  documentName = 'Word (.docx)',
): Promise<Uint8Array | null> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const end = findEndOfCentralDirectory(view)
  if (end === -1) throw new DocumentError(`This does not look like a ${documentName} file. It may be password-protected or damaged.`)

  const entryCount = view.getUint16(end + 10, true)
  let cursor = view.getUint32(end + 16, true)
  if (cursor === 0xffffffff) throw new DocumentError(`This ${documentName} file uses a format that cannot be opened. Try a PDF instead.`)

  const decoder = new TextDecoder()
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL_ENTRY) throw new DocumentError(DAMAGED)

    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const uncompressedSize = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength

    if (name !== entryName) continue
    if (uncompressedSize > maxBytes) throw new DocumentError(TOO_LARGE)
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_ENTRY) throw new DocumentError(DAMAGED)

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    if (dataStart + compressedSize > bytes.length) throw new DocumentError(DAMAGED)
    const data = bytes.subarray(dataStart, dataStart + compressedSize)

    if (method === STORED) return new Uint8Array(data)
    if (method === DEFLATED) return inflate(data, maxBytes)
    throw new DocumentError(`This ${documentName} file uses a compression format that cannot be opened. Try a PDF instead.`)
  }
  return null
}
