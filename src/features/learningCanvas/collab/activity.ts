import type { LearningCanvasContent, LearningCanvasEdge, LearningCanvasNode } from '../types'
import { MAX_ACTIVITY_CHANGES, MAX_ACTIVITY_LINE, MAX_ACTIVITY_SUMMARY } from './constants'
import { sameItem } from './mergeContent'

export type ChangeKind =
  | 'added'
  | 'edited'
  | 'moved'
  | 'resized'
  | 'deleted'
  | 'connected'
  | 'disconnected'
  | 'relabelled'

export interface BoardChange {
  subject: 'card' | 'connection'
  kind: ChangeKind
  id: string
  /** Already human readable, e.g. text card “Mitochondria”. */
  label: string
}

type Board = Pick<LearningCanvasContent, 'nodes' | 'edges'>

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Full description used in log lines. Card text is user content, so it is only ever rendered as plain text. */
export function describeNode(node: LearningCanvasNode): string {
  switch (node.type) {
    case 'text':
      return `text card “${clip(node.text, 40) || 'empty'}”`
    case 'link':
      return `link card “${clip(node.link.title || node.link.url, 40)}”`
    case 'reference':
      return `${node.reference.refType} reference card`
    case 'group':
      return `group “${clip(node.group.label, 40) || 'untitled'}”`
    case 'image':
      return `image card “${clip(node.image.caption || node.image.alt || 'image', 40)}”`
    default:
      return 'card'
  }
}

function shortName(node: LearningCanvasNode | undefined): string {
  if (!node) return 'a card'
  switch (node.type) {
    case 'text':
      return `“${clip(node.text, 24) || 'empty'}”`
    case 'link':
      return `“${clip(node.link.title || node.link.url, 24)}”`
    case 'group':
      return `“${clip(node.group.label, 24) || 'group'}”`
    case 'image':
      return `“${clip(node.image.caption || node.image.alt || 'image', 24)}”`
    default:
      return `${node.reference.refType} card`
  }
}

function withoutGeometry(node: LearningCanvasNode): unknown {
  const { x: _x, y: _y, width: _width, height: _height, ...rest } = node
  return rest
}

function moved(a: LearningCanvasNode, b: LearningCanvasNode): boolean {
  return a.x !== b.x || a.y !== b.y
}

function resized(a: LearningCanvasNode, b: LearningCanvasNode): boolean {
  return a.width !== b.width || a.height !== b.height
}

function connectionLabel(edge: LearningCanvasEdge, nodes: Map<string, LearningCanvasNode>): string {
  return `${shortName(nodes.get(edge.from))} → ${shortName(nodes.get(edge.to))}`
}

/** What `after` changed compared with `before`. Order follows the board, so results are stable. */
export function diffBoards(before: Board, after: Board): BoardChange[] {
  const changes: BoardChange[] = []
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]))
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]))

  for (const node of after.nodes) {
    const old = beforeNodes.get(node.id)
    if (!old) changes.push({ subject: 'card', kind: 'added', id: node.id, label: describeNode(node) })
    else if (!sameItem(withoutGeometry(old), withoutGeometry(node)))
      changes.push({ subject: 'card', kind: 'edited', id: node.id, label: describeNode(node) })
    else if (moved(old, node)) changes.push({ subject: 'card', kind: 'moved', id: node.id, label: describeNode(node) })
    else if (resized(old, node)) changes.push({ subject: 'card', kind: 'resized', id: node.id, label: describeNode(node) })
  }
  for (const node of before.nodes) {
    if (!afterNodes.has(node.id)) changes.push({ subject: 'card', kind: 'deleted', id: node.id, label: describeNode(node) })
  }

  const allNodes = new Map([...beforeNodes, ...afterNodes])
  const beforeEdges = new Map(before.edges.map((e) => [e.id, e]))
  const afterEdgeIds = new Set(after.edges.map((e) => e.id))
  for (const edge of after.edges) {
    const old = beforeEdges.get(edge.id)
    if (!old) changes.push({ subject: 'connection', kind: 'connected', id: edge.id, label: connectionLabel(edge, allNodes) })
    else if (!sameItem(old, edge))
      changes.push({ subject: 'connection', kind: 'relabelled', id: edge.id, label: connectionLabel(edge, allNodes) })
  }
  for (const edge of before.edges) {
    if (!afterEdgeIds.has(edge.id))
      changes.push({ subject: 'connection', kind: 'disconnected', id: edge.id, label: connectionLabel(edge, allNodes) })
  }
  return changes
}

const MODIFY_RANK: Partial<Record<ChangeKind, number>> = { resized: 1, moved: 2, relabelled: 2, edited: 3 }

/** Folds a later change to the same item into an earlier one so a burst of edits reads as one line. */
function combine(prev: BoardChange, next: BoardChange): BoardChange | null {
  if (prev.kind === 'added') {
    return next.kind === 'deleted' ? null : { ...next, kind: 'added' }
  }
  if (prev.kind === 'connected') {
    return next.kind === 'disconnected' ? null : { ...next, kind: 'connected' }
  }
  if (next.kind === 'deleted' || next.kind === 'disconnected') return next
  if (prev.kind === 'deleted') {
    return { ...next, kind: next.subject === 'card' ? 'edited' : 'relabelled' }
  }
  if (prev.kind === 'disconnected') return next.kind === 'connected' ? null : next
  const keep = (MODIFY_RANK[prev.kind] ?? 0) > (MODIFY_RANK[next.kind] ?? 0) ? prev.kind : next.kind
  return { ...next, kind: keep }
}

export function mergeChanges(existing: BoardChange[], incoming: BoardChange[]): BoardChange[] {
  const byKey = new Map(existing.map((c) => [`${c.subject}:${c.id}`, c]))
  for (const change of incoming) {
    const key = `${change.subject}:${change.id}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, change)
      continue
    }
    const combined = combine(prev, change)
    if (combined) byKey.set(key, combined)
    else byKey.delete(key)
  }
  return [...byKey.values()]
}

const VERB: Record<ChangeKind, string> = {
  added: 'Added',
  edited: 'Edited',
  moved: 'Moved',
  resized: 'Resized',
  deleted: 'Deleted',
  connected: 'Connected',
  disconnected: 'Removed connection',
  relabelled: 'Changed connection',
}

const SUMMARY_ORDER: Array<[BoardChange['subject'], ChangeKind, string]> = [
  ['card', 'added', 'added'],
  ['card', 'edited', 'edited'],
  ['card', 'moved', 'moved'],
  ['card', 'resized', 'resized'],
  ['card', 'deleted', 'deleted'],
  ['connection', 'connected', 'added'],
  ['connection', 'disconnected', 'removed'],
  ['connection', 'relabelled', 'changed'],
]

export interface ActivityText {
  summary: string
  lines: string[]
}

/** One short sentence plus up to MAX_ACTIVITY_CHANGES detail lines, all within the rule limits. */
export function summarizeChanges(changes: BoardChange[]): ActivityText {
  const phrases: string[] = []
  for (const [subject, kind, verb] of SUMMARY_ORDER) {
    const count = changes.filter((c) => c.subject === subject && c.kind === kind).length
    if (count === 0) continue
    const noun = subject === 'card' ? 'card' : 'connection'
    phrases.push(`${verb} ${count} ${noun}${count === 1 ? '' : 's'}`)
  }
  const sentence = phrases.join(', ')
  const summary = (sentence.charAt(0).toUpperCase() + sentence.slice(1)).slice(0, MAX_ACTIVITY_SUMMARY)

  const all = changes.map((c) => clip(`${VERB[c.kind]} ${c.label}`, MAX_ACTIVITY_LINE))
  const lines =
    all.length > MAX_ACTIVITY_CHANGES
      ? [...all.slice(0, MAX_ACTIVITY_CHANGES - 1), `…and ${all.length - (MAX_ACTIVITY_CHANGES - 1)} more changes`]
      : all
  return { summary, lines }
}

/** Sentences for membership events. Names are user content and are clipped to stay inside the rule limit. */
export const memberSummary = {
  joined: (name: string, role: string) => clip(`${name} joined as ${role === 'editor' ? 'an editor' : 'a viewer'}`, 200),
  roleChanged: (name: string, role: string) =>
    clip(`Changed ${name}’s access to ${role === 'editor' ? 'can edit' : 'view only'}`, 200),
  removed: (name: string) => clip(`Removed ${name} from this canvas`, 200),
  inviteCreated: (role: string) => `Created an invite link (${role === 'editor' ? 'can edit' : 'view only'})`,
  inviteRevoked: () => 'Turned off an invite link',
}
