import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Full screen for the graph workspace.
 *
 * Uses the native Fullscreen API when available, and always falls back to a
 * fixed overlay (the caller applies the `isExpanded` styles), so it still works
 * where the API is blocked (e.g. iPhone Safari).
 *
 * Safe navigation: the hook leaves native full screen and unlocks body scroll
 * when the component unmounts, so following "Open Canvas" / "Open in
 * Whiteboard" or switching tabs never leaves a stuck full-screen state.
 */
export function useGraphFullscreen(targetRef: RefObject<HTMLElement | null>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const nativeRef = useRef(false)

  const exit = useCallback(async () => {
    setIsExpanded(false)
    if (nativeRef.current) {
      nativeRef.current = false
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen()
        } catch {
          // ignore (already left)
        }
      }
    }
  }, [])

  const enter = useCallback(async () => {
    setIsExpanded(true)
    const element = targetRef.current
    if (element?.requestFullscreen && !document.fullscreenElement) {
      try {
        await element.requestFullscreen()
        nativeRef.current = true
      } catch {
        // Fixed-overlay fallback is already active through isExpanded.
      }
    }
  }, [targetRef])

  const toggle = useCallback(() => {
    void (isExpanded ? exit() : enter())
  }, [isExpanded, enter, exit])

  // Browser-initiated exit (Esc in native full screen) must update our state.
  useEffect(() => {
    const onChange = () => {
      if (nativeRef.current && document.fullscreenElement !== targetRef.current) {
        nativeRef.current = false
        setIsExpanded(false)
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [targetRef])

  // While expanded: lock page scroll and let Esc exit (fallback mode).
  useEffect(() => {
    if (!isExpanded) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog inside the graph handles its own Esc first.
      if (event.key === 'Escape' && !event.defaultPrevented) void exit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isExpanded, exit])

  // Leaving the page/tab (navigation, tab switch) always ends full screen.
  useEffect(() => {
    return () => {
      if (nativeRef.current && document.fullscreenElement) {
        nativeRef.current = false
        void document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  return { isExpanded, toggle, exit }
}
