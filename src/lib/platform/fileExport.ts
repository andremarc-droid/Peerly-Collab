import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export interface ExportFileResult {
  success: boolean
  method: 'native-share' | 'web-share' | 'browser-download'
  cancelled?: boolean
  error?: string
}

/**
 * Triggers a standard browser download using a temporary anchor element.
 * Defers URL.revokeObjectURL to avoid premature revocation bugs on mobile web.
 */
export function browserDownload(content: string, filename: string, mimeType = 'text/csv;charset=utf-8'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignored if already cleaned up
    }
  }, 60_000)
}

/**
 * Exports a text/csv/json file across desktop, mobile web browsers, and Capacitor native apps.
 *
 * - On Capacitor Native: Writes the file to the native filesystem cache/documents and triggers
 *   the native system share sheet so users can save to Downloads/device or share to other apps.
 * - On Mobile Browsers: Uses Web Share API (navigator.share) with File if supported.
 * - Fallback / Desktop: Uses standard anchor download with delayed blob cleanup.
 */
export async function exportFile(
  content: string,
  filename: string,
  mimeType = 'text/csv;charset=utf-8'
): Promise<ExportFileResult> {
  // 1. Capacitor Native platform (Android / iOS)
  if (Capacitor.isNativePlatform()) {
    try {
      const cached = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })

      // Also write to Documents if permitted so it resides in local documents
      try {
        await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
      } catch {
        // Ignored on scoped storage restriction
      }

      await Share.share({
        title: filename,
        url: cached.uri,
        dialogTitle: `Export ${filename}`,
      })

      return { success: true, method: 'native-share' }
    } catch (err: unknown) {
      const isCancelled =
        typeof err === 'object' &&
        err !== null &&
        (('name' in err && (err as { name: unknown }).name === 'AbortError') ||
          ('message' in err && /cancel/i.test(String((err as { message: unknown }).message))))
      if (isCancelled) {
        return { success: true, method: 'native-share', cancelled: true }
      }
      // If native plugin failed unexpectedly, fall through to browser methods
    }
  }

  // 2. Mobile web browsers supporting Web Share API with Files
  if (
    typeof navigator !== 'undefined' &&
    typeof File !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const file = new File([content], filename, { type: mimeType })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        })
        return { success: true, method: 'web-share' }
      }
    } catch (err: unknown) {
      const isCancelled =
        typeof err === 'object' &&
        err !== null &&
        (('name' in err && (err as { name: unknown }).name === 'AbortError') ||
          ('message' in err && /cancel/i.test(String((err as { message: unknown }).message))))
      if (isCancelled) {
        return { success: true, method: 'web-share', cancelled: true }
      }
      // If sharing was rejected or failed, fall through to browser download
    }
  }

  // 3. Desktop / fallback browser download
  try {
    browserDownload(content, filename, mimeType)
    return { success: true, method: 'browser-download' }
  } catch (err) {
    return {
      success: false,
      method: 'browser-download',
      error: err instanceof Error ? err.message : 'Download failed.',
    }
  }
}
