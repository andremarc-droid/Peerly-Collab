import { Capacitor } from '@capacitor/core'
import { useSyncExternalStore } from 'react'

/** Phones (under the `md` breakpoint) and landscape phones, where the width alone would look like a tablet. */
export const MOBILE_VIEW_QUERY = '(max-width: 767.98px), (pointer: coarse) and (max-height: 500px)'

function mediaList(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_VIEW_QUERY) : null
}

/** True inside the installed Android app, or in a browser on a phone-sized screen. */
export function isMobileView(): boolean {
  return Capacitor.isNativePlatform() || (mediaList()?.matches ?? false)
}

function subscribe(onChange: () => void): () => void {
  const list = mediaList()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/** Re-renders when the window crosses the phone breakpoint (rotation, split screen, resizing). */
export function useIsMobileView(): boolean {
  return useSyncExternalStore(subscribe, isMobileView, () => false)
}
