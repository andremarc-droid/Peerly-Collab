import { describe, expect, it } from 'vitest'
import { getOptimalHandles } from './mapping'

describe('canvas mapping getOptimalHandles', () => {
  it('computes correct source and target handles based on relative positions', () => {
    // Target is directly below
    const below = getOptimalHandles({ x: 100, y: 0 }, { x: 100, y: 300 })
    expect(below).toEqual({ sourceHandle: 'bottom', targetHandle: 'top' })

    // Target is directly above
    const above = getOptimalHandles({ x: 100, y: 300 }, { x: 100, y: 0 })
    expect(above).toEqual({ sourceHandle: 'top', targetHandle: 'bottom' })

    // Target is directly to the right
    const right = getOptimalHandles({ x: 0, y: 100 }, { x: 400, y: 100 })
    expect(right).toEqual({ sourceHandle: 'right', targetHandle: 'left' })

    // Target is directly to the left
    const left = getOptimalHandles({ x: 400, y: 100 }, { x: 0, y: 100 })
    expect(left).toEqual({ sourceHandle: 'left', targetHandle: 'right' })
  })
})
