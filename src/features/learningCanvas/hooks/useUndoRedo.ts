import { useCallback, useRef, useState } from 'react'

/**
 * Snapshot-based undo/redo.
 *
 * Contract: call `record(stateBeforeChange)` immediately BEFORE applying a
 * change. `undo(currentState)` / `redo(currentState)` receive the live state
 * and return the snapshot to apply (or undefined when there is nothing to do).
 * Recording clears the redo stack. Consecutive identical snapshots are skipped,
 * so a drag that ends where it started does not create a no-op history entry.
 */
export function useUndoRedo<T>(limit = 50) {
  const pastRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })

  const sync = useCallback(() => {
    const next = { canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 }
    setFlags((prev) =>
      prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next,
    )
  }, [])

  const record = useCallback(
    (snapshot: T) => {
      const past = pastRef.current
      const top = past[past.length - 1]
      if (top !== undefined && JSON.stringify(top) === JSON.stringify(snapshot)) {
        return
      }
      past.push(snapshot)
      if (past.length > limit) past.shift()
      futureRef.current = []
      sync()
    },
    [limit, sync],
  )

  const undo = useCallback(
    (current: T): T | undefined => {
      const previous = pastRef.current.pop()
      if (previous === undefined) return undefined
      futureRef.current.push(current)
      sync()
      return previous
    },
    [sync],
  )

  const redo = useCallback(
    (current: T): T | undefined => {
      const next = futureRef.current.pop()
      if (next === undefined) return undefined
      pastRef.current.push(current)
      sync()
      return next
    },
    [sync],
  )

  const clear = useCallback(() => {
    pastRef.current = []
    futureRef.current = []
    sync()
  }, [sync])

  return { canUndo: flags.canUndo, canRedo: flags.canRedo, record, undo, redo, clear }
}
