import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUndoRedo } from './useUndoRedo'

describe('useUndoRedo', () => {
  it('undo restores the state from before the change and redo reapplies it', () => {
    const { result } = renderHook(() => useUndoRedo<string>())

    // state goes A -> B; the snapshot of A is recorded before the change
    act(() => result.current.record('A'))
    expect(result.current.canUndo).toBe(true)

    let restored: string | undefined
    act(() => {
      restored = result.current.undo('B')
    })
    expect(restored).toBe('A')
    expect(result.current.canRedo).toBe(true)

    let redone: string | undefined
    act(() => {
      redone = result.current.redo('A')
    })
    expect(redone).toBe('B')
  })

  it('two undos walk back exactly two steps (no off-by-one)', () => {
    const { result } = renderHook(() => useUndoRedo<string>())
    // A -> B -> C
    act(() => result.current.record('A'))
    act(() => result.current.record('B'))

    let first: string | undefined
    let second: string | undefined
    act(() => {
      first = result.current.undo('C')
    })
    act(() => {
      second = result.current.undo(first as string)
    })
    expect(first).toBe('B')
    expect(second).toBe('A')
    expect(result.current.canUndo).toBe(false)
  })

  it('recording a new change clears the redo stack', () => {
    const { result } = renderHook(() => useUndoRedo<string>())
    act(() => result.current.record('A'))
    act(() => {
      result.current.undo('B')
    })
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.record('A2'))
    expect(result.current.canRedo).toBe(false)
  })

  it('skips identical consecutive snapshots', () => {
    const { result } = renderHook(() => useUndoRedo<{ x: number }>())
    act(() => result.current.record({ x: 1 }))
    act(() => result.current.record({ x: 1 }))

    let a: { x: number } | undefined
    let b: { x: number } | undefined
    act(() => {
      a = result.current.undo({ x: 2 })
    })
    act(() => {
      b = result.current.undo({ x: 1 })
    })
    expect(a).toEqual({ x: 1 })
    expect(b).toBeUndefined()
  })

  it('caps history at the limit', () => {
    const { result } = renderHook(() => useUndoRedo<number>(3))
    act(() => {
      for (let i = 0; i < 10; i++) result.current.record(i)
    })
    const seen: number[] = []
    act(() => {
      let current = 99
      for (let i = 0; i < 10; i++) {
        const prev = result.current.undo(current)
        if (prev === undefined) break
        seen.push(prev)
        current = prev
      }
    })
    expect(seen).toEqual([9, 8, 7])
  })

  it('returns undefined when there is nothing to undo or redo', () => {
    const { result } = renderHook(() => useUndoRedo<string>())
    expect(result.current.undo('x')).toBeUndefined()
    expect(result.current.redo('x')).toBeUndefined()
  })
})
