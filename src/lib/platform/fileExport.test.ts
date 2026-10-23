import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { browserDownload, exportFile } from './fileExport'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: {
    Cache: 'CACHE',
    Documents: 'DOCUMENTS',
  },
  Encoding: {
    UTF8: 'utf8',
  },
  Filesystem: {
    writeFile: vi.fn(),
  },
}))

vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn(),
  },
}))

describe('fileExport utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('Capacitor native platform', () => {
    it('writes file to Cache & Documents and triggers Share.share on native platform', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/results.csv' })
      vi.mocked(Share.share).mockResolvedValue({} as never)

      const result = await exportFile('a,b,c', 'results.csv')

      expect(Filesystem.writeFile).toHaveBeenCalledWith({
        path: 'results.csv',
        data: 'a,b,c',
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      expect(Share.share).toHaveBeenCalledWith({
        title: 'results.csv',
        url: 'file:///cache/results.csv',
        dialogTitle: 'Export results.csv',
      })
      expect(result).toEqual({ success: true, method: 'native-share' })
    })

    it('marks result as cancelled when native share is dismissed', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/results.csv' })
      vi.mocked(Share.share).mockRejectedValue(new Error('Share was cancelled by user'))

      const result = await exportFile('a,b,c', 'results.csv')

      expect(result).toEqual({ success: true, method: 'native-share', cancelled: true })
    })

    it('falls back to browser methods if native filesystem throws an unexpected error', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Filesystem.writeFile).mockRejectedValue(new Error('Filesystem unavailable'))

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const result = await exportFile('a,b,c', 'results.csv')

      expect(result.method).toBe('browser-download')
      expect(result.success).toBe(true)
      expect(clickSpy).toHaveBeenCalled()
    })
  })

  describe('Web Share API on mobile web', () => {
    it('uses navigator.share with File when canShare returns true', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      const shareMock = vi.fn().mockResolvedValue(undefined)
      const canShareMock = vi.fn().mockReturnValue(true)

      Object.defineProperty(navigator, 'canShare', { value: canShareMock, configurable: true, writable: true })
      Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true, writable: true })

      const result = await exportFile('a,b,c', 'roster.csv')

      expect(canShareMock).toHaveBeenCalled()
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'roster.csv',
        })
      )
      expect(result).toEqual({ success: true, method: 'web-share' })
    })

    it('marks result as cancelled if user dismisses web share with AbortError', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      const shareMock = vi.fn().mockRejectedValue(new DOMException('Share canceled', 'AbortError'))
      const canShareMock = vi.fn().mockReturnValue(true)

      Object.defineProperty(navigator, 'canShare', { value: canShareMock, configurable: true, writable: true })
      Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true, writable: true })

      const result = await exportFile('a,b,c', 'roster.csv')

      expect(result).toEqual({ success: true, method: 'web-share', cancelled: true })
    })
  })

  describe('Browser download fallback (Desktop)', () => {
    it('creates an anchor, triggers click, and defers revokeObjectURL', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
      const createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/123')
      const revokeObjectURL = vi.fn()

      Object.defineProperty(window, 'URL', {
        value: { createObjectURL, revokeObjectURL },
        configurable: true,
        writable: true,
      })

      browserDownload('foo,bar', 'test.csv')

      expect(createObjectURL).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(revokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(60_000)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/123')
    })
  })
})
