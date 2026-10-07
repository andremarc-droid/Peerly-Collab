import {
  processImageFile,
  type ImageProcessingDeps,
} from '../canvas/imageProcessing'
import { MAX_IMAGES_PER_MESSAGE } from './constants'
import type { ChatImage } from './types'

export interface PrepareImagesResult {
  images: ChatImage[]
  errors: string[]
}

function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
  return clean || 'image'
}

/**
 * Turns picked or pasted files into chat images.
 * Each file is validated (JPEG, PNG or WebP up to 10 MB), resized to at most 1024px, re-encoded as JPEG and
 * returned as base64 without the `data:` prefix, ready to be sent to the AI as a data URL.
 */
export async function prepareChatImages(
  files: File[],
  currentCount: number,
  deps?: ImageProcessingDeps,
  makeId: () => string = () => crypto.randomUUID(),
): Promise<PrepareImagesResult> {
  const images: ChatImage[] = []
  const errors: string[] = []
  const capacity = Math.max(0, MAX_IMAGES_PER_MESSAGE - currentCount)

  for (const file of files) {
    if (images.length >= capacity) {
      errors.push(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`)
      break
    }
    try {
      const processed = await processImageFile(file, deps)
      images.push({
        id: makeId(),
        data: processed.data,
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        name: cleanName(file.name),
      })
    } catch (error) {
      errors.push(`${cleanName(file.name)}: ${error instanceof Error ? error.message : 'Could not read this image.'}`)
    }
  }

  return { images, errors }
}
