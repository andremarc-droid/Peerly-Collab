import type { GraphNode, GraphLink } from './graphModel'

export interface SimulationParams {
  repulsion?: number
  springLength?: number
  springStrength?: number
  centerStrength?: number
  friction?: number
  maxVelocity?: number
}

const DEFAULT_PARAMS: Required<SimulationParams> = {
  repulsion: 3000,
  springLength: 100,
  springStrength: 0.05,
  centerStrength: 0.02,
  friction: 0.85,
  maxVelocity: 25,
}

export function stepSimulation(
  nodes: GraphNode[],
  links: GraphLink[],
  params?: SimulationParams,
): number {
  const { repulsion, springLength, springStrength, centerStrength, friction, maxVelocity } = {
    ...DEFAULT_PARAMS,
    ...params,
  }

  const nodeMap = new Map<string, GraphNode>(nodes.map((n) => [n.id, n]))
  let totalKineticEnergy = 0

  // 1. Repulsion between all pairs
  const n = nodes.length
  for (let i = 0; i < n; i++) {
    const a = nodes[i]
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distSq = dx * dx + dy * dy + 1 // avoid div by 0
      const dist = Math.sqrt(distSq)

      // Repulsion force falls off with distance
      const force = (repulsion / distSq)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force

      if (!a.isFixed) {
        a.vx -= fx
        a.vy -= fy
      }
      if (!b.isFixed) {
        b.vx += fx
        b.vy += fy
      }
    }
  }

  // 2. Spring attraction along links
  for (const link of links) {
    const a = nodeMap.get(link.source)
    const b = nodeMap.get(link.target)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const displacement = dist - springLength
    const force = displacement * springStrength

    const fx = (dx / dist) * force
    const fy = (dy / dist) * force

    if (!a.isFixed) {
      a.vx += fx
      a.vy += fy
    }
    if (!b.isFixed) {
      b.vx += fx
      b.vy += fy
    }
  }

  // 3. Center gravity and update velocities & positions
  for (const node of nodes) {
    if (node.isFixed) {
      node.vx = 0
      node.vy = 0
      if (node.fx !== undefined) node.x = node.fx
      if (node.fy !== undefined) node.y = node.fy
      continue
    }

    // Gravity towards (0, 0)
    node.vx -= node.x * centerStrength
    node.vy -= node.y * centerStrength

    // Apply friction damping
    node.vx *= friction
    node.vy *= friction

    // Cap velocity
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed > maxVelocity) {
      node.vx = (node.vx / speed) * maxVelocity
      node.vy = (node.vy / speed) * maxVelocity
    }

    // Update positions
    node.x += node.vx
    node.y += node.vy

    totalKineticEnergy += node.vx * node.vx + node.vy * node.vy
  }

  return totalKineticEnergy
}
