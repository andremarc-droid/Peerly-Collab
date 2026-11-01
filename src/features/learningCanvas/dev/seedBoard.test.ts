import { describe, it, expect } from 'vitest'
import { generateSeededBoard } from './seedBoard'

describe('generateSeededBoard', () => {
  it('generates a 50-card board with ~1.5x edges and 5 image cards', () => {
    const board = generateSeededBoard(50)
    expect(board.nodes.length).toBe(50)
    expect(board.edges.length).toBeGreaterThanOrEqual(70)
    expect(board.edges.length).toBeLessThanOrEqual(80)
    const images = board.nodes.filter((n) => n.type === 'image')
    expect(images.length).toBe(5)
    const textNodes = board.nodes.filter((n) => n.type === 'text')
    expect(textNodes.length).toBe(45)
  })

  it('generates a 150-card board with ~1.5x edges and 8 image cards', () => {
    const board = generateSeededBoard(150)
    expect(board.nodes.length).toBe(150)
    expect(board.edges.length).toBeGreaterThanOrEqual(215)
    expect(board.edges.length).toBeLessThanOrEqual(235)
    const images = board.nodes.filter((n) => n.type === 'image')
    expect(images.length).toBe(8)
  })

  it('generates a 400-card board with ~1.5x edges and 10 image cards', () => {
    const board = generateSeededBoard(400)
    expect(board.nodes.length).toBe(400)
    expect(board.edges.length).toBeGreaterThanOrEqual(580)
    expect(board.edges.length).toBeLessThanOrEqual(620)
    const images = board.nodes.filter((n) => n.type === 'image')
    expect(images.length).toBe(10)
  })

  it('ensures all edges connect valid node IDs', () => {
    const board = generateSeededBoard(50)
    const nodeIds = new Set(board.nodes.map((n) => n.id))
    for (const edge of board.edges) {
      expect(nodeIds.has(edge.from)).toBe(true)
      expect(nodeIds.has(edge.to)).toBe(true)
    }
  })
})

