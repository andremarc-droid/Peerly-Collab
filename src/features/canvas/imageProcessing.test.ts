import { describe, expect, it, vi } from 'vitest'
import {
  MAX_FILE_SIZE_BYTES,
  processImageFile,
  stripDataUrlPrefix,
  toDataUrl,
  validateImageFile,
} from './imageProcessing'

describe('validateImageFile', () => {
  it('accepts jpeg, png, and webp files within 10 MB', () => {
    expect(() => validateImageFile({ type: 'image/jpeg', size: 1024 })).not.toThrow()
    expect(() => validateImageFile({ type: 'image/png', size: 5 * 1024 * 1024 })).not.toThrow()
    expect(() => validateImageFile({ type: 'image/webp', size: 9 * 1024 * 1024 })).not.toThrow()
  })

  it('rejects SVG, GIF, HEIC, and other formats with plain-language message', () => {
    expect(() => validateImageFile({ type: 'image/svg+xml', size: 1024 })).toThrow(
      'Use a JPEG, PNG or WebP image',
    )
    expect(() => validateImageFile({ type: 'image/gif', size: 1024 })).toThrow(
      'Use a JPEG, PNG or WebP image',
    )
    expect(() => validateImageFile({ type: 'image/heic', size: 1024 })).toThrow(
      'Use a JPEG, PNG or WebP image',
    )
    expect(() => validateImageFile({ type: 'application/pdf', size: 1024 })).toThrow(
      'Use a JPEG, PNG or WebP image',
    )
  })

  it('rejects files larger than 10 MB', () => {
    expect(() =>
      validateImageFile({ type: 'image/jpeg', size: MAX_FILE_SIZE_BYTES + 1 }),
    ).toThrow('Image must be 10 MB or smaller')
  })
})

describe('stripDataUrlPrefix & toDataUrl', () => {
  it('strips data: prefix and mime type', () => {
    const raw = 'AAAA1234'
    const full = `data:image/jpeg;base64,${raw}`
    expect(stripDataUrlPrefix(full)).toBe(raw)
  })

  it('formats base64 back into full data URL', () => {
    const raw = 'AAAA1234'
    expect(toDataUrl('image/jpeg', raw)).toBe(`data:image/jpeg;base64,${raw}`)
    expect(toDataUrl('image/webp', raw)).toBe(`data:image/webp;base64,${raw}`)
  })
})

describe('processImageFile', () => {
  it('scales images with longest side > 1024 to 1024 preserving aspect ratio', async () => {
    const closeMock = vi.fn()
    const mockFile = new Blob(['dummy'], { type: 'image/jpeg' })

    const result = await processImageFile(mockFile, {
      decodeBitmap: async () => ({
        width: 2048,
        height: 1024,
        close: closeMock,
      }),
      renderToCanvas: async (_source, _width, _height, mimeType) => ({
        dataUrl: `data:${mimeType};base64,${'A'.repeat(1000)}`,
      }),
    })

    expect(result.width).toBe(1024)
    expect(result.height).toBe(512)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.data).toBe('A'.repeat(1000))
    expect(result.bytes).toBe(Math.floor((1000 * 3) / 4))
    expect(closeMock).toHaveBeenCalled()
  })

  it('leaves dimensions intact if longest side <= 1024', async () => {
    const mockFile = new Blob(['dummy'], { type: 'image/png' })

    const result = await processImageFile(mockFile, {
      decodeBitmap: async () => ({ width: 800, height: 600 }),
      renderToCanvas: async (_source, _w, _h, mimeType) => ({
        dataUrl: `data:${mimeType};base64,${'B'.repeat(500)}`,
      }),
    })

    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
    expect(result.data).toBe('B'.repeat(500))
  })

  it('steps down quality until payload length is <= 350,000 characters', async () => {
    const mockFile = new Blob(['dummy'], { type: 'image/jpeg' })
    const recordedQualities: number[] = []

    const result = await processImageFile(mockFile, {
      decodeBitmap: async () => ({ width: 1000, height: 1000 }),
      renderToCanvas: async (_source, _w, _h, mimeType, quality) => {
        recordedQualities.push(quality)
        // High quality produces > 350,000 chars; lower quality fits
        const length = quality > 0.6 ? 400000 : 300000
        return {
          dataUrl: `data:${mimeType};base64,${'X'.repeat(length)}`,
        }
      },
    })

    expect(result.data.length).toBe(300000)
    expect(recordedQualities.length).toBeGreaterThan(1)
    expect(recordedQualities[0]).toBe(0.85)
  })

  it('shrinks dimensions and retries if quality stepping alone exceeds 350,000 characters', async () => {
    const mockFile = new Blob(['dummy'], { type: 'image/jpeg' })
    let callCount = 0

    const result = await processImageFile(mockFile, {
      decodeBitmap: async () => ({ width: 1024, height: 1024 }),
      renderToCanvas: async (_source, width, _height, mimeType) => {
        callCount += 1
        // Only fit when dimensions are shrunk below 800
        const length = width > 800 ? 500000 : 250000
        return {
          dataUrl: `data:${mimeType};base64,${'Y'.repeat(length)}`,
        }
      },
    })

    expect(callCount).toBeGreaterThan(6) // Exhausted first pass of quality steps
    expect(result.width).toBeLessThan(1024)
    expect(result.data.length).toBe(250000)
  })

  it('throws clear error if image cannot fit within limits after all retries', async () => {
    const mockFile = new Blob(['dummy'], { type: 'image/jpeg' })

    await expect(
      processImageFile(mockFile, {
        decodeBitmap: async () => ({ width: 1024, height: 1024 }),
        renderToCanvas: async () => ({
          dataUrl: `data:image/jpeg;base64,${'Z'.repeat(600000)}`,
        }),
      }),
    ).rejects.toThrow('Image could not be compressed to fit within limits. Try a different image.')
  })
})
