import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveState = 'saved' | 'saving' | 'unsaved' | 'error'

interface UseAutosaveOptions<T> {
  /** When false, markDirty is a no-op (read-only canvases, no onSave). */
  enabled: boolean
  delayMs?: number
  /** Read the LATEST content at save time (not at markDirty time). */
  getLatest: () => T
  save: (value: T) => Promise<void>
  onError?: (error: unknown) => void
}

/**
 * Debounced autosave that always saves the latest content.
 *
 * - `getLatest` is read when the save actually runs, so edits made after the
 *   last markDirty() call (or in the same tick) are never lost to stale closures.
 * - Saves are serialized: two triggers can never run concurrently, which matters
 *   because each save advances the optimistic-concurrency token.
 * - Pending edits are flushed on unmount and when the tab is hidden.
 */
export function useAutosave<T>({
  enabled,
  delayMs = 2000,
  getLatest,
  save,
  onError,
}: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveState>('saved')

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyVersionRef = useRef(0)
  const savedVersionRef = useRef(0)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())
  const mountedRef = useRef(true)
  const optionsRef = useRef({ enabled, getLatest, save, onError })

  useEffect(() => {
    optionsRef.current = { enabled, getLatest, save, onError }
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const doSave = useCallback(async (): Promise<boolean> => {
    if (dirtyVersionRef.current === savedVersionRef.current) return true
    const { enabled: isEnabled, getLatest: read, save: write, onError: report } = optionsRef.current
    if (!isEnabled) return true

    const version = dirtyVersionRef.current
    if (mountedRef.current) setStatus('saving')
    try {
      await write(read())
      savedVersionRef.current = version
      if (mountedRef.current) {
        setStatus(dirtyVersionRef.current === version ? 'saved' : 'unsaved')
      }
      return true
    } catch (error) {
      if (mountedRef.current) setStatus('error')
      report?.(error)
      return false
    }
  }, [])

  const run = useCallback((): Promise<boolean> => {
    const next = chainRef.current.then(doSave)
    chainRef.current = next
    return next
  }, [doSave])

  const markDirty = useCallback(() => {
    if (!optionsRef.current.enabled) return
    dirtyVersionRef.current += 1
    setStatus('unsaved')
    clearTimer()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void run()
    }, delayMs)
  }, [clearTimer, delayMs, run])

  /** Save now (used by Retry, tab hide and unmount). */
  const flush = useCallback(() => {
    clearTimer()
    return run()
  }, [clearTimer, run])

  /** Declare the current content saved (after reload-from-server or a forced overwrite). */
  const markSaved = useCallback(() => {
    clearTimer()
    savedVersionRef.current = dirtyVersionRef.current
    if (mountedRef.current) setStatus('saved')
  }, [clearTimer])

  useEffect(() => {
    mountedRef.current = true
    const hasPending = () => dirtyVersionRef.current !== savedVersionRef.current

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && hasPending()) void flush()
    }
    const handlePageHide = () => {
      if (hasPending()) void flush()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      mountedRef.current = false
      clearTimer()
      if (hasPending()) void run()
    }
  }, [clearTimer, flush, run])

  return {
    status,
    isDirty: status !== 'saved',
    markDirty,
    flush,
    markSaved,
  }
}
