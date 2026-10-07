import { describe, expect, it } from 'vitest'
import type { ImageProcessingDeps } from '../canvas/imageProcessing'
import { MAX_IMAGES_PER_MESSAGE } from './constants'
import { prepareChatImages } from './images'

const deps: ImageProcessingDeps = {
  decodeBitmap: async () => ({ width: 2000, height: 1000 }),
  renderToCanvas: async () => ({ dataUrl: 'data:image/jpeg;base64,QUJD' }),
}

function file(name: string, type = 'image/png'): File {
  return new File(['pixels'], name, { type })
}

function idFactory(): () => string {
  let count = 0
  return () => `id-${(count += 1)}`
}

describe('prepareChatImages', () => {
  it('turns a picked file into resized base64 without the data: prefix', async () => {
    const result = await prepareChatImages([file('photo.png')], 0, deps, idFactory())

    expect(result.errors).toEqual([])
    expect(result.images).toEqual([
      { id: 'id-1', data: 'QUJD', mimeType: 'image/jpeg', width: 1024, height: 512, name: 'photo.png' },
    ])
  })

  it('reports unsupported files and still keeps the good ones', async () => {
    const result = await prepareChatImages([file('ok.png'), file('anim.gif', 'image/gif')], 0, deps, idFactory())

    expect(result.images.map((image) => image.name)).toEqual(['ok.png'])
    expect(result.errors).toEqual(['anim.gif: Use a JPEG, PNG or WebP image'])
  })

  it('stops at the per-message image limit', async () => {
    const files = [file('a.png'), file('b.png'), file('c.png')]
    const result = await prepareChatImages(files, 0, deps, idFactory())

    expect(result.images).toHaveLength(MAX_IMAGES_PER_MESSAGE)
    expect(result.errors).toEqual([`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`])
  })

  it('counts images already attached to the draft', async () => {
    const result = await prepareChatImages([file('a.png')], MAX_IMAGES_PER_MESSAGE, deps, idFactory())

    expect(result.images).toEqual([])
    expect(result.errors).toHaveLength(1)
  })

  it('explains a file that cannot be decoded', async () => {
    const broken: ImageProcessingDeps = {
      ...deps,
      decodeBitmap: async () => {
        throw new Error('Corrupt image')
      },
    }
    const result = await prepareChatImages([file('bad.png')], 0, broken, idFactory())

    expect(result.images).toEqual([])
    expect(result.errors).toEqual(['bad.png: Corrupt image'])
  })

  it('shortens very long names and names unnamed files', async () => {
    const result = await prepareChatImages([file(`${'a'.repeat(80)}.png`), file('')], 0, deps, idFactory())

    expect(result.images[0].name).toHaveLength(60)
    expect(result.images[1].name).toBe('image')
  })
})
