import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStaleBuildRecovery, shouldReloadForStaleBuild } from './staleBuildRecovery'

afterEach(() => sessionStorage.clear())

describe('shouldReloadForStaleBuild', () => {
  it('allows the first reload', () => {
    expect(shouldReloadForStaleBuild(sessionStorage, 1_000_000)).toBe(true)
  })

  it('refuses a second reload right away to avoid a loop', () => {
    expect(shouldReloadForStaleBuild(sessionStorage, 1_000_000)).toBe(true)
    expect(shouldReloadForStaleBuild(sessionStorage, 1_005_000)).toBe(false)
  })

  it('allows another reload after the guard window has passed', () => {
    expect(shouldReloadForStaleBuild(sessionStorage, 1_000_000)).toBe(true)
    expect(shouldReloadForStaleBuild(sessionStorage, 1_020_000)).toBe(true)
  })

  it('does not reload when storage is unavailable', () => {
    const brokenStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } } as unknown as Storage
    expect(shouldReloadForStaleBuild(brokenStorage, 1_000_000)).toBe(false)
  })
})

describe('installStaleBuildRecovery', () => {
  it('reloads once on a preload error, then lets a repeat error surface', () => {
    const reload = vi.fn()
    const remove = installStaleBuildRecovery(window, reload)

    const first = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(first)
    expect(first.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    const second = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)

    remove()
  })

  it('stops listening once removed', () => {
    const reload = vi.fn()
    installStaleBuildRecovery(window, reload)()
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    expect(reload).not.toHaveBeenCalled()
  })
})
