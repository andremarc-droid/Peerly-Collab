export const CHUNK_RELOAD_STORAGE_KEY = 'peerly:chunkReloadAt'
const RELOAD_WINDOW_MS = 10_000

/**
 * True when the page should reload to pick up a newer deployment. Returns false if we already
 * reloaded very recently, so a genuinely missing file can never cause a reload loop.
 */
export function shouldReloadForStaleBuild(storage: Storage, now: number): boolean {
  try {
    const lastReload = Number(storage.getItem(CHUNK_RELOAD_STORAGE_KEY))
    if (lastReload > 0 && now - lastReload < RELOAD_WINDOW_MS) return false
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}

/**
 * After a new deployment, a tab still running the old build asks for page files that no longer
 * exist. Vite reports that as `vite:preloadError`; reloading fetches the current build.
 */
export function installStaleBuildRecovery(
  target: Window = window,
  reload: () => void = () => target.location.reload(),
): () => void {
  function handlePreloadError(event: Event) {
    if (!shouldReloadForStaleBuild(target.sessionStorage, Date.now())) return
    event.preventDefault()
    reload()
  }
  target.addEventListener('vite:preloadError', handlePreloadError)
  return () => target.removeEventListener('vite:preloadError', handlePreloadError)
}
