import { DriveError } from './errors'

const IDENTITY_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'

const loading = new Map<string, Promise<void>>()
let pickerLoading: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  const existing = loading.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading.delete(src)
      script.remove()
      reject(new DriveError('script'))
    }
    document.head.appendChild(script)
  })
  loading.set(src, promise)
  return promise
}

export async function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return
  await loadScript(IDENTITY_SRC)
  if (!window.google?.accounts?.oauth2) throw new DriveError('script')
}

export function loadGooglePicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve()
  pickerLoading ??= loadScript(GAPI_SRC)
    .then(() => new Promise<void>((resolve, reject) => {
      const gapi = window.gapi
      if (!gapi) { reject(new DriveError('script')); return }
      gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new DriveError('script')) })
    }))
    .catch((reason: unknown) => { pickerLoading = null; throw reason })
  return pickerLoading
}

/**
 * Warms both scripts when a Drive button first appears, so the sign-in popup opens straight from the click
 * (browsers block popups that start after a slow network wait).
 */
export function preloadGoogleScripts(): void {
  void loadGoogleIdentity().catch(() => undefined)
  void loadGooglePicker().catch(() => undefined)
}
