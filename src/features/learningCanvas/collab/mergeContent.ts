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

/** Fast-path field-by-field node equality that skips serializing massive base64 image strings. */
export function sameNode(a: LearningCanvasNode, b: LearningCanvasNode): boolean {
  if (a === b) return true
  if (
    a.id !== b.id ||
    a.type !== b.type ||
    a.x !== b.x ||
    a.y !== b.y ||
    a.width !== b.width ||
    a.height !== b.height ||
    a.color !== b.color
  ) {
    return false
  }
  if (a.type === 'text' && b.type === 'text') {
    return a.text === b.text
  }
  if (a.type === 'image' && b.type === 'image') {
    if (a.image.alt !== b.image.alt || a.image.caption !== b.image.caption) return false
    if (a.image.dataUrl.length !== b.image.dataUrl.length) return false
    return a.image.dataUrl === b.image.dataUrl
  }
  if (a.type === 'link' && b.type === 'link') {
    return a.link.url === b.link.url && a.link.title === b.link.title && a.link.note === b.link.note
  }
  if (a.type === 'reference' && b.type === 'reference') {
    return a.reference.refType === b.reference.refType && a.reference.refId === b.reference.refId
  }
  if (a.type === 'group' && b.type === 'group') {
    return a.group.label === b.group.label
  }
  return sameItem(a, b)
}

/** Fast-path edge equality avoiding string serialization. */
export function sameEdge(a: LearningCanvasEdge, b: LearningCanvasEdge): boolean {
  if (a === b) return true
  return (
    a.id === b.id &&
    a.from === b.from &&
    a.to === b.to &&
    a.fromSide === b.fromSide &&
    a.toSide === b.toSide &&
    a.label === b.label &&
    a.arrow === b.arrow
  )
}

/** True when two boards have the same cards and connections (the viewport is ignored). */
export function sameBoard(
  a: Pick<LearningCanvasContent, 'nodes' | 'edges'>,
  b: Pick<LearningCanvasContent, 'nodes' | 'edges'>,
): boolean {
  if (a === b) return true
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false

  const aNodes = sortById(a.nodes)
  const bNodes = sortById(b.nodes)
  for (let i = 0; i < aNodes.length; i++) {
    if (!sameNode(aNodes[i]!, bNodes[i]!)) return false
  }

  const aEdges = sortById(a.edges)
  const bEdges = sortById(b.edges)
  for (let i = 0; i < aEdges.length; i++) {
    if (!sameEdge(aEdges[i]!, bEdges[i]!)) return false
  }

  return true
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
export function mergeById<T extends { id: string }>(
  base: T[],
  local: T[],
  remote: T[],
  isEqual: (a: T, b: T) => boolean = (a, b) => sameItem(a, b),
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
      const iChanged = !was || !isEqual(was, mine)
      const theyChanged = !was || !isEqual(was, theirs)
      items.push(!iChanged && theyChanged ? theirs : mine)
    } else if (mine) {
      // Gone remotely: keep only if it is new here or I changed it after they deleted it.
      if (!was || !isEqual(was, mine)) items.push(mine)
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
  const nodeMerge = mergeById<LearningCanvasNode>(base.nodes, local.nodes, remote.nodes, sameNode)
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
  const edgeMerge = mergeById<LearningCanvasEdge>(base.edges, local.edges, remote.edges, sameEdge)
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
