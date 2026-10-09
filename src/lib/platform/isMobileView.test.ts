import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMobileView, MOBILE_VIEW_QUERY, useIsMobileView } from './isMobileView'

const native = vi.hoisted(() => ({ value: false }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }))

type Listener = () => void

/** A matchMedia stand-in whose result the test can change, notifying subscribers like a real window does. */
function stubMatchMedia(initial: boolean) {
  const state = { matches: initial }
  const listeners = new Set<Listener>()
  const matchMedia = vi.fn(() => ({
    get matches() {
      return state.matches
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }))
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    matchMedia,
    change(matches: boolean) {
      state.matches = matches
      listeners.forEach((listener) => listener())
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  native.value = false
})

describe('isMobileView', () => {
  it('is false on a browser without matchMedia and outside the app', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isMobileView()).toBe(false)
  })

  it('follows the phone media query in a browser', () => {
    const media = stubMatchMedia(true)
    expect(isMobileView()).toBe(true)
    expect(media.matchMedia).toHaveBeenCalledWith(MOBILE_VIEW_QUERY)
    media.change(false)
    expect(isMobileView()).toBe(false)
  })

  it('is always true inside the installed app, whatever the window size', () => {
    stubMatchMedia(false)
    native.value = true
    expect(isMobileView()).toBe(true)
  })

  it('covers phones in landscape as well as narrow windows', () => {
    expect(MOBILE_VIEW_QUERY).toContain('max-width: 767.98px')
    expect(MOBILE_VIEW_QUERY).toContain('pointer: coarse')
  })
})

describe('useIsMobileView', () => {
  it('updates when the window crosses the phone breakpoint and stops listening on unmount', () => {
    const media = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => useIsMobileView())
    expect(result.current).toBe(false)
    expect(media.listenerCount()).toBe(1)

    act(() => media.change(true))
    expect(result.current).toBe(true)

    unmount()
    expect(media.listenerCount()).toBe(0)
  })
})
