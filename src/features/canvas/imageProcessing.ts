export interface ProcessedImageData {
  data: string // Base64 string WITHOUT data: prefix
  mimeType: 'image/jpeg' | 'image/webp'
  width: number
  height: number
  bytes: number
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_LONGEST_SIDE = 1024
export const TARGET_BASE64_LENGTH = 350000
export const HARD_CAP_BASE64_LENGTH = 700000

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface ImageProcessingDeps {
  decodeBitmap?: (blob: Blob) => Promise<{ width: number; height: number; close?: () => void }>
  renderToCanvas?: (
    source: unknown,
    width: number,
    height: number,
    mimeType: 'image/jpeg' | 'image/webp',
    quality: number,
  ) => Promise<{ dataUrl: string }>
}

function calculateScaledDimensions(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) {
    return { width, height }
  }
  const ratio = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/**
 * Validates file type and size before decoding.
 */
export function validateImageFile(file: { type: string; size: number; name?: string }): void {
  if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Use a JPEG, PNG or WebP image')
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Image must be 10 MB or smaller')
  }
}

/**
 * Default browser implementation using createImageBitmap and HTMLCanvasElement.
 */
async function defaultDecodeBitmap(blob: Blob): Promise<{ width: number; height: number; close?: () => void }> {
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    // imageOrientation: 'from-image' correctly respects orientation tags
    return await window.createImageBitmap(blob, { imageOrientation: 'from-image' })
  }
  throw new Error('Image decoding is not supported in this environment.')
}

async function defaultRenderToCanvas(
  source: unknown,
  width: number,
  height: number,
  mimeType: 'image/jpeg' | 'image/webp',
  quality: number,
): Promise<{ dataUrl: string }> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas rendering is not supported in this environment.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D canvas context.')
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  const dataUrl = canvas.toDataURL(mimeType, quality)
  return { dataUrl }
}

/**
 * Strips data URL prefix to extract raw base64 string.
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, '')
}

/**
 * Formats base64 payload into a complete data URL.
 */
export function toDataUrl(mimeType: 'image/jpeg' | 'image/webp', base64Data: string): string {
  return `data:${mimeType};base64,${base64Data}`
}

/**
 * Client-side image processing:
 * 1. Validates format (JPEG, PNG, WebP) and size (<= 10MB)
 * 2. Decodes via createImageBitmap (with orientation normalization)
 * 3. Scales longest side to at most 1024px
 * 4. Iteratively encodes with stepped quality and dimension scaling until base64 length <= 350,000 characters
 * 5. Returns { data, mimeType, width, height, bytes }
 */
export async function processImageFile(
  file: File | Blob,
  deps: ImageProcessingDeps = {},
): Promise<ProcessedImageData> {
  validateImageFile(file)

  const decode = deps.decodeBitmap ?? defaultDecodeBitmap
  const render = deps.renderToCanvas ?? defaultRenderToCanvas

  const bitmap = await decode(file)

  try {
    const originalWidth = bitmap.width
    const originalHeight = bitmap.height
    if (originalWidth < 1 || originalHeight < 1) {
      throw new Error('Invalid image dimensions.')
    }

    let { width: currentWidth, height: currentHeight } = calculateScaledDimensions(
      originalWidth,
      originalHeight,
      MAX_LONGEST_SIDE,
    )

    const qualitySteps = [0.85, 0.75, 0.65, 0.5, 0.35, 0.2]
    const targetMime: 'image/jpeg' | 'image/webp' = 'image/jpeg'

    // Try multiple quality steps; if still too large, shrink dimensions and retry
    for (let attempt = 0; attempt < 5; attempt += 1) {
      for (const quality of qualitySteps) {
        const { dataUrl } = await render(bitmap, currentWidth, currentHeight, targetMime, quality)
        const base64 = stripDataUrlPrefix(dataUrl)

        if (base64.length <= TARGET_BASE64_LENGTH) {
          const bytes = Math.floor((base64.length * 3) / 4)
          return {
            data: base64,
            mimeType: targetMime,
            width: currentWidth,
            height: currentHeight,
            bytes,
          }
        }
      }

      // Shrink dimensions by 25% and retry
      currentWidth = Math.max(128, Math.round(currentWidth * 0.75))
      currentHeight = Math.max(128, Math.round(currentHeight * 0.75))
    }

    throw new Error('Image could not be compressed to fit within limits. Try a different image.')
  } finally {
    if (bitmap.close) {
      bitmap.close()
    }
  }
}
