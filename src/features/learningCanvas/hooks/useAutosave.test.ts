import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from './useAutosave'

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves the latest content, not the content at the time of the edit', async () => {
    let current = 'original'
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => current, save }),
    )

    act(() => result.current.markDirty())
    current = 'typed after the edit was registered'

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('typed after the edit was registered')
    expect(result.current.status).toBe('saved')
  })

  it('debounces bursts of edits into one save', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => 'x', save }),
    )

    act(() => result.current.markDirty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    act(() => result.current.markDirty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(save).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('never runs two saves at the same time', async () => {
    let resolveFirst: () => void = () => {}
    let inFlight = 0
    let maxInFlight = 0
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          resolveFirst = () => {
            inFlight -= 1
            resolve()
          }
        }),
    )
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => 'x', save }),
    )

    act(() => result.current.markDirty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(save).toHaveBeenCalledTimes(1)

    // an edit and a flush arrive while the first save is still running
    act(() => result.current.markDirty())
    act(() => {
      void result.current.flush()
    })
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst()
      await Promise.resolve()
    })
    await act(async () => {
      resolveFirst()
      await Promise.resolve()
    })

    expect(maxInFlight).toBe(1)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('reports errors, keeps the content dirty and retries via flush', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => 'x', save, onError }),
    )

    act(() => result.current.markDirty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(result.current.status).toBe('error')
    expect(result.current.isDirty).toBe(true)
    expect(onError).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.flush()
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('saved')
  })

  it('flushes pending edits when the component unmounts', async () => {
    let current = 'draft'
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => current, save }),
    )

    act(() => result.current.markDirty())
    current = 'last edit before leaving'
    unmount()
    await vi.advanceTimersByTimeAsync(0)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('last edit before leaving')
  })

  it('does nothing when disabled (read-only canvases)', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: false, getLatest: () => 'x', save }),
    )

    act(() => result.current.markDirty())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')
  })

  it('markSaved cancels the pending save', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAutosave<string>({ enabled: true, getLatest: () => 'x', save }),
    )

    act(() => result.current.markDirty())
    act(() => result.current.markSaved())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')
  })
})
