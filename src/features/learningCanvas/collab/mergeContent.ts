import {
  MAX_LEARNING_CANVAS_EDGES,
  MAX_LEARNING_CANVAS_GROUPS,
  MAX_LEARNING_CANVAS_NODES,
} from '../constants'
import type { LearningCanvasContent, LearningCanvasEdge, LearningCanvasNode } from '../types'

export interface MergeResult {
  content: LearningCanvasContent
  /** Items from other people that were left out because the canvas is at its size limit. */
  dropped: number
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    }
    return v
  })
}

export function sameItem(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}

/** True when two boards have the same cards and connections (the viewport is ignored). */
export function sameBoard(
  a: Pick<LearningCanvasContent, 'nodes' | 'edges'>,
  b: Pick<LearningCanvasContent, 'nodes' | 'edges'>,
): boolean {
  return sameItem(sortById(a.nodes), sortById(b.nodes)) && sameItem(sortById(a.edges), sortById(b.edges))
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
}

/**
 * Three-way merge by id. `base` is the last server state this editor built on,
 * `local` is what this editor has now, `remote` is the newest server state.
 * A side that changed an item wins over a side that did not. When both changed
 * the same item, local wins (last writer). A local delete beats a remote edit.
 */
function mergeById<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
): { items: T[]; remoteOnly: Set<string> } {
  const baseMap = new Map(base.map((item) => [item.id, item]))
  const localMap = new Map(local.map((item) => [item.id, item]))
  const remoteMap = new Map(remote.map((item) => [item.id, item]))
  const remoteOnly = new Set<string>()
  const items: T[] = []

  const ids = [...localMap.keys(), ...[...remoteMap.keys()].filter((id) => !localMap.has(id))]
  for (const id of ids) {
    const was = baseMap.get(id)
    const mine = localMap.get(id)
    const theirs = remoteMap.get(id)

    if (mine && theirs) {
      const iChanged = !was || !sameItem(was, mine)
      const theyChanged = !was || !sameItem(was, theirs)
      items.push(!iChanged && theyChanged ? theirs : mine)
    } else if (mine) {
      // Gone remotely: keep only if it is new here or I changed it after they deleted it.
      if (!was || !sameItem(was, mine)) items.push(mine)
    } else if (theirs && !was) {
      items.push(theirs)
      remoteOnly.add(id)
    }
    // theirs && was && !mine: I deleted it, so it stays deleted.
  }
  return { items, remoteOnly }
}

/** Removes other people's additions (newest last) until the list fits, never local items. */
function cap<T extends { id: string }>(items: T[], max: number, removable: Set<string>): { items: T[]; dropped: number } {
  let list = items
  let dropped = 0
  for (let i = list.length - 1; i >= 0 && list.length > max; i--) {
    const item = list[i]
    if (item && removable.has(item.id)) {
      list = list.filter((candidate) => candidate.id !== item.id)
      dropped += 1
    }
  }
  return { items: list, dropped }
}

function connectionKey(edge: LearningCanvasEdge): string {
  return `${edge.from}->${edge.to}:${edge.fromSide ?? ''}:${edge.toSide ?? ''}`
}

export function mergeContent(
  base: LearningCanvasContent,
  local: LearningCanvasContent,
  remote: LearningCanvasContent,
): MergeResult {
  const nodeMerge = mergeById<LearningCanvasNode>(base.nodes, local.nodes, remote.nodes)
  let nodes = nodeMerge.items
  let dropped = 0

  const cappedNodes = cap(nodes, MAX_LEARNING_CANVAS_NODES, nodeMerge.remoteOnly)
  nodes = cappedNodes.items
  dropped += cappedNodes.dropped

  const groupIds = new Set(nodes.filter((n) => n.type === 'group').map((n) => n.id))
  if (groupIds.size > MAX_LEARNING_CANVAS_GROUPS) {
    const removableGroups = new Set([...groupIds].filter((id) => nodeMerge.remoteOnly.has(id)))
    const cappedGroups = cap(
      nodes.filter((n) => n.type === 'group'),
      MAX_LEARNING_CANVAS_GROUPS,
      removableGroups,
    )
    const keep = new Set(cappedGroups.items.map((n) => n.id))
    nodes = nodes.filter((n) => n.type !== 'group' || keep.has(n.id))
    dropped += cappedGroups.dropped
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edgeMerge = mergeById<LearningCanvasEdge>(base.edges, local.edges, remote.edges)
  const seenConnections = new Set<string>()
  let edges = edgeMerge.items.filter((edge) => {
    if (edge.from === edge.to || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return false
    const key = connectionKey(edge)
    if (seenConnections.has(key)) return false
    seenConnections.add(key)
    return true
  })
  const cappedEdges = cap(edges, MAX_LEARNING_CANVAS_EDGES, edgeMerge.remoteOnly)
  edges = cappedEdges.items
  dropped += cappedEdges.dropped

  return { content: { version: 1, nodes, edges, viewport: remote.viewport }, dropped }
}
