import type { GraphLink } from './graphModel'

export interface GraphPosition {
  x: number
  y: number
  isFixed?: boolean
}

export function mergeNodeIds(local: string[], baseline: string[], remote: string[]): string[] {
  const result = new Set(remote)
  const baselineIds = new Set(baseline)
  const localIds = new Set(local)

  for (const id of baselineIds) {
    if (!localIds.has(id)) result.delete(id)
  }
  for (const id of localIds) {
    if (!baselineIds.has(id)) result.add(id)
  }

  return [...result]
}

export function mergePositions(
  local: Record<string, GraphPosition>,
  baseline: Record<string, GraphPosition>,
  remote: Record<string, GraphPosition>,
): Record<string, GraphPosition> {
  const result = { ...remote }
  const ids = new Set([...Object.keys(local), ...Object.keys(baseline)])

  for (const id of ids) {
    const localPosition = local[id]
    const baselinePosition = baseline[id]
    if (!localPosition && baselinePosition) {
      delete result[id]
    } else if (localPosition && !samePosition(localPosition, baselinePosition)) {
      result[id] = localPosition
    }
  }

  return result
}

export function mergeGraphLinks(
  local: GraphLink[],
  baseline: GraphLink[],
  remote: GraphLink[],
  includedNodeIds: Set<string>,
): GraphLink[] {
  const baselineIds = new Set(baseline.map((link) => link.id))
  const localById = new Map(local.map((link) => [link.id, link]))
  const result = new Map(remote.map((link) => [link.id, link]))

  for (const link of baseline) {
    if (!localById.has(link.id)) result.delete(link.id)
  }
  for (const link of local) {
    if (!baselineIds.has(link.id)) result.set(link.id, link)
  }

  return [...result.values()].filter(
    (link) => link.source !== link.target
      && includedNodeIds.has(link.source)
      && includedNodeIds.has(link.target),
  ).slice(0, 120)
}

export function addGraphLink(
  links: GraphLink[],
  source: string,
  target: string,
  includedNodeIds: Set<string>,
): GraphLink[] {
  if (
    source === target
    || !includedNodeIds.has(source)
    || !includedNodeIds.has(target)
    || links.length >= 120
    || links.some((link) => link.id === `${source}->${target}`)
  ) return links

  return [...links, { id: `${source}->${target}`, source, target }]
}

export function removeGraphLink(links: GraphLink[], source: string, target: string): GraphLink[] {
  return links.filter(
    (link) => !(
      (link.source === source && link.target === target)
      || (link.source === target && link.target === source)
    ),
  )
}

export function graphLinksEqual(left: GraphLink[], right: GraphLink[]): boolean {
  if (left.length !== right.length) return false
  const rightById = new Map(right.map((link) => [link.id, link]))
  return left.every((link) => {
    const other = rightById.get(link.id)
    return other?.source === link.source && other.target === link.target
  })
}

function samePosition(left: GraphPosition, right: GraphPosition | undefined): boolean {
  return Boolean(
    right
    && left.x === right.x
    && left.y === right.y
    && (left.isFixed === true) === (right.isFixed === true),
  )
}
