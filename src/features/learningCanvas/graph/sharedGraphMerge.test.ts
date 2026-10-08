import { describe, expect, it } from 'vitest'
import {
  addGraphLink,
  graphLinksEqual,
  mergeGraphLinks,
  mergeNodeIds,
  mergePositions,
  removeGraphLink,
} from './sharedGraphMerge'
import type { GraphLink } from './graphModel'

describe('shared graph state merging', () => {
  it('merges local node additions and removals with remote node changes', () => {
    expect(mergeNodeIds(
      ['note:local'],
      ['note:removed'],
      ['note:removed', 'note:remote'],
    )).toEqual(['note:remote', 'note:local'])
  })

  it('keeps local position changes and deletions while taking remote changes', () => {
    expect(mergePositions(
      {
        'note:local': { x: 5, y: 6, isFixed: true },
      },
      {
        'note:local': { x: 0, y: 0 },
        'note:removed': { x: 1, y: 1 },
      },
      {
        'note:local': { x: 0, y: 0 },
        'note:removed': { x: 1, y: 1 },
        'note:remote': { x: 7, y: 8 },
      },
    )).toEqual({
      'note:local': { x: 5, y: 6, isFixed: true },
      'note:remote': { x: 7, y: 8 },
    })
  })

  it('merges pending link additions and removals with remote links', () => {
    const local: GraphLink[] = [
      { id: 'note:a->note:c', source: 'note:a', target: 'note:c' },
    ]
    const baseline: GraphLink[] = [
      { id: 'note:a->note:b', source: 'note:a', target: 'note:b' },
    ]
    const remote: GraphLink[] = [
      ...baseline,
      { id: 'note:b->note:c', source: 'note:b', target: 'note:c' },
    ]

    expect(mergeGraphLinks(local, baseline, remote, new Set(['note:a', 'note:b', 'note:c']))).toEqual([
      { id: 'note:b->note:c', source: 'note:b', target: 'note:c' },
      { id: 'note:a->note:c', source: 'note:a', target: 'note:c' },
    ])
  })

  it('adds only unique links between distinct included nodes', () => {
    const included = new Set(['note:a', 'note:b'])
    const first = addGraphLink([], 'note:a', 'note:b', included)

    expect(first).toEqual([{ id: 'note:a->note:b', source: 'note:a', target: 'note:b' }])
    expect(addGraphLink(first, 'note:a', 'note:b', included)).toBe(first)
    expect(addGraphLink(first, 'note:a', 'note:a', included)).toBe(first)
    expect(addGraphLink(first, 'note:a', 'note:outside', included)).toBe(first)
  })

  it('keeps shared graph link writes within the Firestore 120-link limit', () => {
    const links: GraphLink[] = Array.from({ length: 120 }, (_, index) => ({
      id: `note:${index}->note:${index + 1}`,
      source: `note:${index}`,
      target: `note:${index + 1}`,
    }))
    const included = new Set(links.flatMap((link) => [link.source, link.target]))

    expect(addGraphLink(links, 'note:0', 'note:120', included)).toBe(links)
  })

  it('removes either link direction and compares links by stable identity', () => {
    const links: GraphLink[] = [
      { id: 'note:a->note:b', source: 'note:a', target: 'note:b' },
      { id: 'note:c->note:d', source: 'note:c', target: 'note:d' },
    ]

    expect(removeGraphLink(links, 'note:b', 'note:a')).toEqual([links[1]])
    expect(graphLinksEqual(links, [...links].reverse())).toBe(true)
  })
})
