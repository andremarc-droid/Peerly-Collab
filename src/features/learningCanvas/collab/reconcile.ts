import { sameItem } from './mergeContent'

/**
 * Applies a merged result to the editor's live (React Flow) items without
 * rebuilding everything: untouched items keep their identity and selection,
 * changed ones are rebuilt, new ones added, deleted ones removed.
 *
 * `localDomain` is the editor's current board in domain form, so we can tell
 * which flow items already match the merged result.
 */
export function reconcileById<F extends { id: string; selected?: boolean }, D extends { id: string }>(
  prevFlow: F[],
  localDomain: D[],
  mergedDomain: D[],
  toFlow: (item: D) => F,
): F[] {
  const prevById = new Map(prevFlow.map((item) => [item.id, item]))
  const localById = new Map(localDomain.map((item) => [item.id, item]))

  return mergedDomain.map((item) => {
    const prev = prevById.get(item.id)
    const before = localById.get(item.id)
    if (prev && before && sameItem(before, item)) return prev
    const next = toFlow(item)
    return prev?.selected ? { ...next, selected: true } : next
  })
}
